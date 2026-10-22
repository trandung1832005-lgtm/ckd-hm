export type Role = 'admin' | 'clinician' | 'patient'
export type Cluster = 'Chuyển biến xấu' | 'Ổn định' | 'Cải thiện'

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  status: 'active' | 'pending' | 'disabled'
  created_at: string
  last_login_at: string | null
}

export interface Patient {
  id: number
  code: string
  gender: 1 | 2
  etiology: 1 | 2 | 3 | 4
  hypertension: boolean
  diabetes: boolean
  cvd: boolean
  linked_email: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
  latest_cluster: Cluster | null
  latest_prediction_at: string | null
  latest_egfr: number | null
}

export interface Egfr {
  month: number
  value: number
  measured_on?: string | null
}

export interface Measurement {
  id: number
  patient_id: number
  recorded_on: string
  age_years: number
  sbp: number
  albumin: number
  upcr: number | null
  created_at: string
  egfr: Egfr[]
}

export interface PredResult {
  month: number
  egfr_pred: number
  stage: string
}

export interface Run {
  id: number
  patient_id: number
  measurement_id: number | null
  status: string
  cluster: Cluster | null
  slope_per_year: number | null
  total_change: number | null
  risk_score: number | null
  last_observed: number | null
  stage_36m: string | null
  n_visits: number | null
  confidence: string | null
  warnings: string[] | null
  created_at: string
  model_version: string | null
  results: PredResult[]
  history: Egfr[]
}

export interface Note {
  id: number
  kind: 'note' | 'plan' | 'follow_up'
  body: string
  due_date: string | null
  visible_to_patient: boolean
  created_at: string
  author_name: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface StageInfo {
  range: string
  label: string
  description: string
  goals: string[]
  diet: string[]
  lifestyle: string[]
  monitoring: string[]
  complications: string[]
}

export interface Education {
  updated_on: string
  review_status: string
  disclaimer: string
  sources: { id: string; title: string; url: string; accessed: string }[]
  egfr_guide: { title: string; points: string[] }
  warning_signs: { title: string; points: string[]; note: string }
  stages: Record<string, StageInfo>
  clusters: Record<string, string>
}

export interface RegSet {
  mae: number
  rmse: number
  r2: number
  within5: number
  within10: number
  n_patients?: number
  n_values?: number
  bias?: number
  per_month?: Record<string, { n: number; mae: number; rmse: number }>
  mae_by_stage?: Record<string, { n: number; mae: number }>
  stage36?: { n: number; exact: number; within1: number }
}

export interface ClusterEval {
  counts: Record<string, number>
  n_eval: number
  n_fast: number
  mean_true_slope: Record<string, number>
  eta2: number
  order_ok: boolean
  auc: number
  accuracy: number
  sensitivity: number | null
  specificity: number | null
  confusion: { tn: number; fp: number; fn: number; tp: number }
}

export interface Evaluation {
  deployed: {
    sets: Record<string, { regression: RegSet; cluster: ClusterEval }>
    scatter_test: { month: number; actual: number; predicted: number }[]
    fast_decline_threshold: number
    reliability: {
      interval_90: { month: number; lower: number; upper: number; half_width: number; coverage: number }[]
      interval_note: string
      calibration: { bin: number; p_mean: number; y_mean: number; y_sd: number | null; n: number }[]
    }
  }
  project: {
    learning_epoch: { epoch: number; train: number; val: number; diem: number; lr: number }[]
    learning_data: { so_bn: number; train_mean: number; train_std: number; val_mean: number; val_std: number }[]
    learning_note: string
    robustness: Record<'Validation' | 'Test', { kich_ban: string; giu_nhom: number; auc: number; mae: number }[]>
    final_summary: Record<string, Record<'Train' | 'Validation' | 'Test', string>>
    accuracy_train_val: Record<string, Record<'Train' | 'Validation', string>>
    sample_counts: { name: string; Train: string; Validation: string }[]
  }
  reported: {
    source: string
    caveat: string
    regression: Record<string, RegSet>
    risk_detection_test: { auc: number; accuracy: number; sensitivity: number; specificity: number }
    cluster_comparison: Record<'GMM' | 'KMeans', { auc: number; eta2: number; ari: number; silhouette: number; davies_bouldin: number }> & { note: string }
    experiments: { id: number; model: string; name: string; val_mae: number; train_mae: number | null; params: number | null; note: string }[]
  }
  dataset: Record<string, number | string>
  scope_note: string
}
