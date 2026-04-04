"""Tests for published links CRUD, lifecycle, and comments."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db import models


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client: TestClient, email: str, password: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": password})
    return r.json()["access_token"]


def _error_message(response) -> str:
    body = response.json()
    return body.get("detail", "") or body.get("error", {}).get("message", "")


@pytest.fixture
def admin_user(db_session: Session):
    user = models.User(
        email="linkadmin@example.com",
        password_hash=get_password_hash("admin123456"),
        is_admin=True,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def regular_user(db_session: Session):
    user = models.User(
        email="linkuser@example.com",
        password_hash=get_password_hash("user123456"),
        is_admin=False,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_user(db_session: Session):
    user = models.User(
        email="other@example.com",
        password_hash=get_password_hash("other123456"),
        is_admin=False,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def share(db_session: Session, regular_user: models.User):
    s = models.Share(
        kind=models.ShareKind.DOC,
        path="Links/Test.md",
        visibility=models.ShareVisibility.PUBLIC,
        owner_user_id=regular_user.id,
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)
    return s


class TestPublishedLinkCRUD:

    def test_create_public_link(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-123",
                "target_path": "Links/Test.md",
                "access_mode": "public",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 201
        data = r.json()
        assert data["access_mode"] == "public"
        assert data["state"] == "active"
        assert data["slug"]
        assert data["target_id"] == "abc-123"

    def test_create_protected_link_requires_password(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-123",
                "target_path": "Links/Test.md",
                "access_mode": "protected",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 400
        assert "password" in _error_message(r).lower()

    def test_create_protected_link_with_password(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-123",
                "target_path": "Links/Test.md",
                "access_mode": "protected",
                "password": "secretpass123",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 201
        assert r.json()["access_mode"] == "protected"

    def test_list_links_filtered_by_share(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
            },
            headers=_auth_headers(token),
        )
        client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-2",
                "target_path": "Links/B.md",
            },
            headers=_auth_headers(token),
        )
        r = client.get(
            f"/v1/published-links?share_id={share.id}",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_link_by_id(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        create_r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
            },
            headers=_auth_headers(token),
        )
        link_id = create_r.json()["id"]
        r = client.get(f"/v1/published-links/{link_id}", headers=_auth_headers(token))
        assert r.status_code == 200
        assert r.json()["id"] == link_id

    def test_update_link_title(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        create_r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
                "title": "Old Title",
            },
            headers=_auth_headers(token),
        )
        link_id = create_r.json()["id"]
        r = client.patch(
            f"/v1/published-links/{link_id}",
            json={"title": "New Title"},
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        assert r.json()["title"] == "New Title"

    def test_create_link_with_custom_slug(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
                "slug": "my-custom-slug",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 201
        assert r.json()["slug"] == "my-custom-slug"

    def test_duplicate_slug_rejected(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
                "slug": "unique-slug",
            },
            headers=_auth_headers(token),
        )
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-2",
                "target_path": "Links/B.md",
                "slug": "unique-slug",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 400
        assert "taken" in _error_message(r).lower()


class TestPublishedLinkLifecycle:

    def _create_link(
        self, client: TestClient, token: str, share_id: uuid.UUID,
    ) -> dict:
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share_id),
                "target_type": "file",
                "target_id": "lc-target",
                "target_path": "Links/Lifecycle.md",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 201
        return r.json()

    def test_revoke_link(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        r = client.post(
            f"/v1/published-links/{link['id']}/revoke",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        assert r.json()["state"] == "revoked"

    def test_revoke_already_revoked_fails(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        client.post(
            f"/v1/published-links/{link['id']}/revoke",
            headers=_auth_headers(token),
        )
        r = client.post(
            f"/v1/published-links/{link['id']}/revoke",
            headers=_auth_headers(token),
        )
        assert r.status_code == 400

    def test_rotate_link(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        old_slug = link["slug"]
        r = client.post(
            f"/v1/published-links/{link['id']}/rotate",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        new_link = r.json()
        assert new_link["state"] == "active"
        assert new_link["slug"] != old_slug
        assert new_link["id"] != link["id"]

    def test_restore_revoked_link(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        client.post(
            f"/v1/published-links/{link['id']}/revoke",
            headers=_auth_headers(token),
        )
        r = client.post(
            f"/v1/published-links/{link['id']}/restore",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        assert r.json()["state"] == "active"

    def test_restore_active_link_fails(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        r = client.post(
            f"/v1/published-links/{link['id']}/restore",
            headers=_auth_headers(token),
        )
        assert r.status_code == 400

    def test_link_events_logged(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        client.post(
            f"/v1/published-links/{link['id']}/revoke",
            headers=_auth_headers(token),
        )
        r = client.get(
            f"/v1/published-links/{link['id']}/events",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        events = r.json()
        assert len(events) >= 2
        types = {e["event_type"] for e in events}
        assert "created" in types
        assert "revoked" in types

    def test_list_links_excludes_revoked_by_default(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        client.post(
            f"/v1/published-links/{link['id']}/revoke",
            headers=_auth_headers(token),
        )
        r = client.get(
            f"/v1/published-links?share_id={share.id}",
            headers=_auth_headers(token),
        )
        ids = {l["id"] for l in r.json()}
        assert link["id"] not in ids

    def test_list_links_includes_revoked_when_requested(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link = self._create_link(client, token, share.id)
        client.post(
            f"/v1/published-links/{link['id']}/revoke",
            headers=_auth_headers(token),
        )
        r = client.get(
            f"/v1/published-links?share_id={share.id}&include_revoked=true",
            headers=_auth_headers(token),
        )
        ids = {l["id"] for l in r.json()}
        assert link["id"] in ids


class TestPublishedLinkPermissions:

    def test_non_member_cannot_create_link(
        self, client: TestClient, other_user: models.User, share: models.Share,
    ):
        token = _login(client, other_user.email, "other123456")
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 403

    def test_non_owner_cannot_revoke(
        self,
        client: TestClient,
        regular_user: models.User,
        other_user: models.User,
        share: models.Share,
    ):
        owner_token = _login(client, regular_user.email, "user123456")
        create_r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
            },
            headers=_auth_headers(owner_token),
        )
        link_id = create_r.json()["id"]

        other_token = _login(client, other_user.email, "other123456")
        r = client.post(
            f"/v1/published-links/{link_id}/revoke",
            headers=_auth_headers(other_token),
        )
        assert r.status_code == 403

    def test_admin_can_revoke_any_link(
        self,
        client: TestClient,
        regular_user: models.User,
        admin_user: models.User,
        share: models.Share,
    ):
        owner_token = _login(client, regular_user.email, "user123456")
        create_r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "abc-1",
                "target_path": "Links/A.md",
            },
            headers=_auth_headers(owner_token),
        )
        link_id = create_r.json()["id"]

        admin_token = _login(client, admin_user.email, "admin123456")
        r = client.post(
            f"/v1/published-links/{link_id}/revoke",
            headers=_auth_headers(admin_token),
        )
        assert r.status_code == 200


class TestCapabilities:

    def test_admin_capabilities(
        self, client: TestClient, admin_user: models.User,
    ):
        token = _login(client, admin_user.email, "admin123456")
        r = client.get(
            "/v1/published-links/capabilities/me",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        caps = r.json()
        assert caps["can_manage_links"] is True
        assert caps["can_create_users"] is True
        assert caps["can_view_audit"] is True

    def test_regular_user_no_share_context(
        self, client: TestClient, regular_user: models.User,
    ):
        token = _login(client, regular_user.email, "user123456")
        r = client.get(
            "/v1/published-links/capabilities/me",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        caps = r.json()
        assert caps["can_create_users"] is False

    def test_owner_capabilities_with_share_context(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        r = client.get(
            f"/v1/published-links/capabilities/me?share_id={share.id}",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        caps = r.json()
        assert caps["can_manage_links"] is True
        assert caps["can_revoke_links"] is True
        assert caps["can_manage_members"] is True


class TestComments:

    @pytest.fixture
    def link_with_comments(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "cmt-target",
                "target_path": "Links/Comments.md",
                "allow_comments": True,
            },
            headers=_auth_headers(token),
        )
        return r.json(), token

    def test_create_comment_thread(
        self, client: TestClient, link_with_comments,
    ):
        link, token = link_with_comments
        r = client.post(
            f"/v1/published-links/{link['id']}/comments/threads",
            json={
                "target_id": "cmt-target",
                "anchor_type": "document",
                "body": "This is a test comment",
            },
            headers=_auth_headers(token),
        )
        assert r.status_code == 201
        thread = r.json()
        assert thread["target_id"] == "cmt-target"
        assert thread["status"] == "open"
        assert len(thread["items"]) == 1
        assert thread["items"][0]["body_markdown"] == "This is a test comment"

    def test_list_comment_threads(
        self, client: TestClient, link_with_comments,
    ):
        link, token = link_with_comments
        client.post(
            f"/v1/published-links/{link['id']}/comments/threads",
            json={"target_id": "cmt-target", "body": "Thread 1"},
            headers=_auth_headers(token),
        )
        client.post(
            f"/v1/published-links/{link['id']}/comments/threads",
            json={"target_id": "cmt-target", "body": "Thread 2"},
            headers=_auth_headers(token),
        )
        r = client.get(
            f"/v1/published-links/{link['id']}/comments",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_reply_to_thread(
        self, client: TestClient, link_with_comments,
    ):
        link, token = link_with_comments
        create_r = client.post(
            f"/v1/published-links/{link['id']}/comments/threads",
            json={"target_id": "cmt-target", "body": "Original"},
            headers=_auth_headers(token),
        )
        thread_id = create_r.json()["id"]
        r = client.post(
            f"/v1/comment-threads/{thread_id}/reply",
            json={"body": "Reply text"},
            headers=_auth_headers(token),
        )
        assert r.status_code == 201
        assert r.json()["body_markdown"] == "Reply text"

    def test_resolve_thread(
        self, client: TestClient, link_with_comments,
    ):
        link, token = link_with_comments
        create_r = client.post(
            f"/v1/published-links/{link['id']}/comments/threads",
            json={"target_id": "cmt-target", "body": "To resolve"},
            headers=_auth_headers(token),
        )
        thread_id = create_r.json()["id"]
        r = client.post(
            f"/v1/comment-threads/{thread_id}/resolve",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"

    def test_reopen_thread(
        self, client: TestClient, link_with_comments,
    ):
        link, token = link_with_comments
        create_r = client.post(
            f"/v1/published-links/{link['id']}/comments/threads",
            json={"target_id": "cmt-target", "body": "To reopen"},
            headers=_auth_headers(token),
        )
        thread_id = create_r.json()["id"]
        client.post(
            f"/v1/comment-threads/{thread_id}/resolve",
            headers=_auth_headers(token),
        )
        r = client.post(
            f"/v1/comment-threads/{thread_id}/reopen",
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "open"

    def test_comments_disabled_link_forbids_thread_creation(
        self, client: TestClient, regular_user: models.User, share: models.Share,
    ):
        token = _login(client, regular_user.email, "user123456")
        link_r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "no-cmt",
                "target_path": "Links/NoCmt.md",
                "allow_comments": False,
            },
            headers=_auth_headers(token),
        )
        link_id = link_r.json()["id"]
        r = client.post(
            f"/v1/published-links/{link_id}/comments/threads",
            json={"target_id": "no-cmt", "body": "Should fail"},
            headers=_auth_headers(token),
        )
        assert r.status_code == 403

    def test_non_member_cannot_comment(
        self,
        client: TestClient,
        regular_user: models.User,
        other_user: models.User,
        share: models.Share,
    ):
        owner_token = _login(client, regular_user.email, "user123456")
        link_r = client.post(
            "/v1/published-links",
            json={
                "share_id": str(share.id),
                "target_type": "file",
                "target_id": "cmt-priv",
                "target_path": "Links/Priv.md",
                "allow_comments": True,
            },
            headers=_auth_headers(owner_token),
        )
        link_id = link_r.json()["id"]

        other_token = _login(client, other_user.email, "other123456")
        r = client.post(
            f"/v1/published-links/{link_id}/comments/threads",
            json={"target_id": "cmt-priv", "body": "Should fail"},
            headers=_auth_headers(other_token),
        )
        assert r.status_code == 403
