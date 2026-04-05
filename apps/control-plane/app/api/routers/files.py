from __future__ import annotations

import hashlib
import hmac
import io
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from minio import Minio
from minio.error import S3Error
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api import deps
from app.core.config import get_settings
from app.db import models

CAS_PREFIX = "cas/"
SIGNED_URL_TTL = 3600

limiter = Limiter(key_func=get_remote_address)

file_token_router = APIRouter(tags=["files"])
files_router = APIRouter(prefix="/files", tags=["files"])


class FileTokenRequest(BaseModel):
    docId: str
    relay: str | None = None
    folder: str
    hash: str
    contentType: str
    contentLength: int


def _minio() -> Minio:
    s = get_settings()
    return Minio(
        s.minio_endpoint,
        access_key=s.minio_access_key,
        secret_key=s.minio_secret_key,
        secure=s.minio_secure,
    )


def _key(file_hash: str) -> str:
    return f"{CAS_PREFIX}{file_hash}"


def _sign(file_hash: str, action: str, exp: int) -> str:
    secret = get_settings().jwt_secret.encode()
    return hmac.new(secret, f"{file_hash}:{action}:{exp}".encode(), hashlib.sha256).hexdigest()


def _public_origin(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost")
    return f"{proto}://{host}"


def _ensure_bucket(client: Minio, bucket: str) -> None:
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def _verify_sig(file_hash: str, action: str, sig: str, exp: int) -> None:
    if time.time() > exp:
        raise HTTPException(403, "Signed URL expired")
    if not hmac.compare_digest(sig, _sign(file_hash, action, exp)):
        raise HTTPException(403, "Invalid signature")


# ── POST /file-token ───────────────────────────────────────────────
@file_token_router.post("/file-token")
@limiter.limit("120/minute")
def create_file_token(
    request: Request,
    payload: FileTokenRequest,
    current_user: models.User = Depends(deps.get_current_user),
):
    settings = get_settings()
    expiry = int(time.time()) + settings.relay_token_ttl_minutes * 60

    auth_header = request.headers.get("authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()

    origin = _public_origin(request)
    return {
        "url": "",
        "baseUrl": f"{origin}/v1/files/cas/{payload.hash}",
        "docId": payload.docId,
        "folder": payload.folder,
        "token": token,
        "authorization": "full",
        "expiryTime": expiry,
        "contentType": 0,
        "contentLength": 0,
        "fileHash": 0,
    }


# ── HEAD /files/cas/{hash} ────────────────────────────────────────
@files_router.head("/cas/{file_hash}")
def head_file(
    file_hash: str,
    current_user: models.User = Depends(deps.get_current_user),
):
    s = get_settings()
    try:
        _minio().stat_object(s.minio_bucket, _key(file_hash))
        return Response(status_code=200)
    except S3Error as e:
        if e.code == "NoSuchKey":
            return Response(status_code=404)
        raise HTTPException(500, str(e))


# ── GET /files/cas/{hash}/download-url ─────────────────────────────
@files_router.get("/cas/{file_hash}/download-url")
def get_download_url(
    request: Request,
    file_hash: str,
    current_user: models.User = Depends(deps.get_current_user),
):
    exp = int(time.time()) + SIGNED_URL_TTL
    sig = _sign(file_hash, "download", exp)
    origin = _public_origin(request)
    return {"downloadUrl": f"{origin}/v1/files/blob/{file_hash}?sig={sig}&exp={exp}&action=download"}


# ── POST /files/cas/{hash}/upload-url ──────────────────────────────
@files_router.post("/cas/{file_hash}/upload-url")
def get_upload_url(
    request: Request,
    file_hash: str,
    current_user: models.User = Depends(deps.get_current_user),
):
    exp = int(time.time()) + SIGNED_URL_TTL
    sig = _sign(file_hash, "upload", exp)
    origin = _public_origin(request)
    return {"uploadUrl": f"{origin}/v1/files/blob/{file_hash}?sig={sig}&exp={exp}&action=upload"}


# ── GET /files/blob/{hash}  (presigned download — no auth header) ──
@files_router.get("/blob/{file_hash}")
def download_blob(file_hash: str, sig: str, exp: int, action: str = "download"):
    _verify_sig(file_hash, action, sig, exp)
    s = get_settings()
    client = _minio()
    try:
        stat = client.stat_object(s.minio_bucket, _key(file_hash))
        obj = client.get_object(s.minio_bucket, _key(file_hash))
        headers: dict[str, str] = {}
        if stat.size is not None:
            headers["content-length"] = str(stat.size)
        return StreamingResponse(
            obj,
            media_type=stat.content_type or "application/octet-stream",
            headers=headers,
        )
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(404, "File not found")
        raise HTTPException(500, str(e))


# ── PUT /files/blob/{hash}  (presigned upload — no auth header) ────
@files_router.put("/blob/{file_hash}")
async def upload_blob(request: Request, file_hash: str, sig: str, exp: int, action: str = "upload"):
    _verify_sig(file_hash, action, sig, exp)
    s = get_settings()
    body = await request.body()
    ct = request.headers.get("content-type", "application/octet-stream")
    client = _minio()
    _ensure_bucket(client, s.minio_bucket)
    client.put_object(s.minio_bucket, _key(file_hash), io.BytesIO(body), len(body), content_type=ct)
    return Response(status_code=200)
