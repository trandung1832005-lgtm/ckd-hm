import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import Base, SessionLocal, engine
from .ml.predictor import Predictor
from .registry import sync_model_versions
from .routers import admin, auth, misc, patients

settings = get_settings()
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.sqlalchemy_url.startswith("sqlite"):
        Base.metadata.create_all(engine)  # chỉ cho dev/test; PostgreSQL dùng `alembic upgrade head`
    app.state.predictor = Predictor(settings.model_asset_dir)
    with SessionLocal() as db:
        sync_model_versions(db, app.state.predictor)
    yield


app = FastAPI(title="CKD eGFR Progression API", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs" if settings.environment != "production" else None,
              redoc_url=None, openapi_url="/api/openapi.json" if settings.environment != "production" else None)

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=False,
                   allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Cache-Control"] = "no-store"
    return resp


# Định dạng lỗi thống nhất: {"error": <mã>, "message": <thông điệp>, "details"?: [...]}
@app.exception_handler(HTTPException)
async def http_exc(_: Request, exc: HTTPException):
    body = exc.detail if isinstance(exc.detail, dict) else {"error": "error", "message": str(exc.detail)}
    return JSONResponse(body, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exc(_: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse({"error": "validation_error", "message": "Dữ liệu không hợp lệ", "details": details},
                        status_code=422)


for r in (auth.router, patients.router, admin.router, misc.router):
    app.include_router(r)
