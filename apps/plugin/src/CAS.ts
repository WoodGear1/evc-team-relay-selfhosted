import type { LiveTokenStore } from "./LiveTokenStore";
import { S3RN } from "./S3RN";
import type { SharedFolder } from "./SharedFolder";
import type { SyncFile } from "./SyncFile";
import { customFetch } from "./customFetch";
import PocketBase from "pocketbase";
import { HasLogging } from "./debug";

function inspectBinaryPayload(buffer: ArrayBuffer): {
	size: number;
	signature: string;
	isHtml: boolean;
	isSvg: boolean;
} {
	const bytes = new Uint8Array(buffer);
	const size = bytes.byteLength;
	const ascii = new TextDecoder("utf-8", { fatal: false })
		.decode(bytes.slice(0, Math.min(256, size)))
		.trim()
		.toLowerCase();

	if (
		size >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return { size, signature: "png", isHtml: false, isSvg: false };
	}
	if (size >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return { size, signature: "jpeg", isHtml: false, isSvg: false };
	}
	if (ascii.startsWith("gif87a") || ascii.startsWith("gif89a")) {
		return { size, signature: "gif", isHtml: false, isSvg: false };
	}
	if (ascii.startsWith("bm")) {
		return { size, signature: "bmp", isHtml: false, isSvg: false };
	}
	if (
		size >= 12 &&
		String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
	) {
		return { size, signature: "webp", isHtml: false, isSvg: false };
	}
	if (ascii.includes("<svg")) {
		return { size, signature: "svg", isHtml: false, isSvg: true };
	}
	if (
		ascii.startsWith("<!doctype html") ||
		ascii.startsWith("<html") ||
		ascii.includes("<body")
	) {
		return { size, signature: "html", isHtml: true, isSvg: false };
	}
	return { size, signature: "unknown", isHtml: false, isSvg: false };
}


export class ContentAddressedStore extends HasLogging {
	private pb: PocketBase;
	private tokenStore: LiveTokenStore;

	constructor(private sharedFolder: SharedFolder) {
		super();
		const authUrl = sharedFolder.loginManager.getEndpointManager().getAuthUrl();
		this.pb = new PocketBase(authUrl, sharedFolder.loginManager.authStore);
		this.tokenStore = sharedFolder.tokenStore;
	}

	async verify(syncFile: SyncFile): Promise<boolean> {
		if (!syncFile.meta) {
			throw new Error("cannot head file with missing hash");
		}
		const sha256 = syncFile.meta.hash;
		const token = await this.tokenStore.getFileToken(
			S3RN.encode(syncFile.s3rn),
			sha256,
			syncFile.mimetype,
			0,
		);
		const response = await customFetch(token.baseUrl!, {
			method: "HEAD",
			headers: { Authorization: `Bearer ${token.token}` },
		});
		if (syncFile.path.toLowerCase().startsWith("img/")) {
			console.log("[Relay:attachment] cas:verify", {
				path: syncFile.path,
				hash: sha256,
				status: response.status,
				baseUrl: token.baseUrl,
			});
		}
		return response.status === 200;
	}

	async readFile(syncFile: SyncFile): Promise<ArrayBuffer> {
		if (!syncFile.meta) {
			throw new Error("cannot pull file with missing hash");
		}
		const sha256 = syncFile.meta.hash;
		const token = await this.tokenStore.getFileToken(
			S3RN.encode(syncFile.s3rn),
			sha256,
			syncFile.mimetype,
			0,
		);
		const response = await customFetch(token.baseUrl + "/download-url", {
			method: "GET",
			headers: { Authorization: `Bearer ${token.token}` },
		});
		if (syncFile.path.toLowerCase().startsWith("img/")) {
			console.log("[Relay:attachment] cas:download-url", {
				path: syncFile.path,
				hash: sha256,
				status: response.status,
				baseUrl: token.baseUrl,
			});
		}
		if (response.status === 404) {
			throw new Error(
				`[${this.sharedFolder.path}] File is missing: ${syncFile.guid} ${syncFile.meta.hash} ${syncFile.meta.type}`,
			);
		}
		if (!response.ok) {
			throw new Error(
				`[${this.sharedFolder.path}] Unable to get download URL for ${syncFile.path}: ${response.status}`,
			);
		}
		const responseJson = await response.json();
		const presignedUrl = responseJson.downloadUrl;
		const downloadResponse = await customFetch(presignedUrl);
		if (syncFile.path.toLowerCase().startsWith("img/")) {
			console.log("[Relay:attachment] cas:download", {
				path: syncFile.path,
				hash: sha256,
				status: downloadResponse.status,
			});
		}
		if (!downloadResponse.ok) {
			throw new Error(
				`[${this.sharedFolder.path}] Download failed for ${syncFile.path}: ${downloadResponse.status}`,
			);
		}
		const payload = await downloadResponse.arrayBuffer();
		if (syncFile.path.toLowerCase().startsWith("img/")) {
			const inspection = inspectBinaryPayload(payload);
			console.log("[Relay:attachment] cas:download-payload", {
				path: syncFile.path,
				hash: sha256,
				bytes: inspection.size,
				signature: inspection.signature,
				contentType: downloadResponse.headers.get("content-type"),
				contentLength: downloadResponse.headers.get("content-length"),
			});
			if (inspection.isHtml) {
				throw new Error(
					`Downloaded HTML instead of image for ${syncFile.path}`,
				);
			}
			if (inspection.size === 0) {
				throw new Error(`Downloaded empty payload for ${syncFile.path}`);
			}
		}
		return payload;
	}

	async writeFile(syncFile: SyncFile): Promise<void> {
		const content = await syncFile.caf.read();
		const hash = await syncFile.caf.hash();
		this.log("writeFile", hash);
		if (!(content && hash)) {
			throw new Error("invalid caf");
		}
		const token = await this.tokenStore.getFileToken(
			S3RN.encode(syncFile.s3rn),
			hash,
			syncFile.mimetype,
			content.byteLength,
		);
		const response = await customFetch(token.baseUrl + "/upload-url", {
			method: "POST",
			headers: { Authorization: `Bearer ${token.token}` },
		});
		if (syncFile.path.toLowerCase().startsWith("img/")) {
			console.log("[Relay:attachment] cas:upload-url", {
				path: syncFile.path,
				hash,
				status: response.status,
				baseUrl: token.baseUrl,
				size: content.byteLength,
				contentType: syncFile.mimetype,
			});
		}
		const responseJson = await response.json();
		if (response.status !== 200) {
			throw new Error(responseJson.error);
		}
		const presignedUrl = responseJson.uploadUrl;
		const uploadResponse = await customFetch(presignedUrl, {
			method: "PUT",
			headers: { "Content-Type": syncFile.mimetype },
			body: content,
		});
		if (syncFile.path.toLowerCase().startsWith("img/")) {
			console.log("[Relay:attachment] cas:upload", {
				path: syncFile.path,
				hash,
				status: uploadResponse.status,
				size: content.byteLength,
			});
		}
		if (!uploadResponse.ok) {
			throw new Error(
				`Upload failed for ${syncFile.path}: ${uploadResponse.status}`,
			);
		}
		return;
	}

	public destroy() {
		this.pb.cancelAllRequests();
		this.pb = null as unknown as PocketBase;
		this.tokenStore = null as unknown as LiveTokenStore;
		this.sharedFolder = null as unknown as SharedFolder;
	}
}
