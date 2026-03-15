# Vertex AI Automation Setup

This repo can submit GPU fine-tuning jobs from GitHub Actions using `google-github-actions/auth`.

## What the workflow does

1. Authenticates GitHub Actions to Google Cloud with Workload Identity Federation.
2. Submits a Vertex AI custom job on pushes to `main` when training files or processed data change.
3. Trains the LoRA adapter with `training/vertex_train.py`.
4. Uploads the adapter and optional merged model to your GCS bucket.

## One-time Google Cloud setup

Create or choose:

- A Google Cloud project with Vertex AI and IAM APIs enabled
- A GCS bucket for training outputs
- A service account for Vertex AI jobs
- A Workload Identity Pool and Provider that trust your GitHub repo

Recommended service account roles:

- `roles/aiplatform.user`
- `roles/storage.admin` on the training output bucket
- `roles/iam.serviceAccountUser` if you use a separate runtime service account for jobs

For GitHub OIDC, grant your GitHub principal permission to impersonate the service account:

- `roles/iam.workloadIdentityUser`

Official references:

- `google-github-actions/auth`: https://github.com/google-github-actions/auth
- Vertex AI custom jobs: https://cloud.google.com/vertex-ai/docs/training/create-custom-job
- Workload Identity Federation for deployment pipelines: https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines

## GitHub repository variables

Add these repository variables in GitHub:

- `GCP_PROJECT_ID`: your Google Cloud project ID
- `GCP_REGION`: usually `us-central1`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: full provider name like `projects/123456789/locations/global/workloadIdentityPools/github/providers/my-repo`
- `GCP_SERVICE_ACCOUNT`: service account email used by GitHub Actions
- `VERTEX_TRAINING_BUCKET`: bucket URI like `gs://my-react-testgen-training`

Optional repository variables:

- `VERTEX_MACHINE_TYPE`: default `n1-standard-8`
- `VERTEX_ACCELERATOR_TYPE`: default `NVIDIA_TESLA_T4`
- `VERTEX_ACCELERATOR_COUNT`: default `1`
- `VERTEX_EXECUTOR_IMAGE`: default `us-docker.pkg.dev/vertex-ai/training/pytorch-gpu.2-4.py310:latest`

## Triggering runs

Automatic runs:

- Push changes to `main` that touch `training/**` or `data/processed/**`

Manual runs:

- Open the `Train On Vertex AI` workflow in GitHub Actions
- Use `workflow_dispatch` to override the training file or disable merged model export

## Output layout

Each run uploads artifacts to:

`gs://YOUR_BUCKET/runs/react-testgen-<sha>-<timestamp>/`

Subfolders:

- `adapter/`
- `merged/` when merge is enabled

## Notes

- The current automation targets GPU, not TPU.
- The training code still depends on `bitsandbytes`, so a CUDA-capable image is required.
- If your dataset gets large, switch `training_file` to a `gs://` path instead of committing it to the repo.
