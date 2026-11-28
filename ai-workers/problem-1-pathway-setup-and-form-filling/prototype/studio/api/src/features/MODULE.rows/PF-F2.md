Entry points: `platform-files.ts` (PF-F2 part 1: `UploadsController` at `/api/platform/files/uploads`, `UploadDoors` (one registry, a value) and `UploadRail` built by a factory over the bound `LocalFiles` store, `PgLegalHolds` and PF-14's runner (the hourly `platform.files.upload_cleanup`); the rail is off, every request 503, when `PLATFORM_FILES=s3`).
Tests: tests/check_pff2_uploads.ts
