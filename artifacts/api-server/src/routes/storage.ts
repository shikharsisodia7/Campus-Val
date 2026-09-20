import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import { ObjectNotFoundError, getPrivateObjectStorage, isPrivateStorageConfigured } from '../lib/storage';
import { resolveStorageProvider } from '../lib/config';
import { sendPrivateFile } from '../lib/private-file-response';

import { requireAuth } from '../middlewares/requireAuth';

const router: IRouter = Router();

// Kept in sync with MAX_FILE_SIZE in progress-report.ts. Must not be derived
// from client-supplied size — this bounds what the signed upload token
// itself will accept, ahead of the authoritative post-upload metadata check.
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  requireAuth,
  async (req: Request, res: Response) => {
    if (!isPrivateStorageConfigured()) {
      res.status(503).json({ error: 'Object storage is not configured.' });
      return;
    }
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      // Assign ownership before the browser receives the signed PUT URL. This
      // binds the opaque object path to the authenticated requester, so it
      // cannot later be claimed by a different student at registration time.
      const storage = await getPrivateObjectStorage();
      const { uploadURL, objectPath } = await storage.createUploadTarget(
        req.userId!,
        { contentType, maxSizeBytes: MAX_UPLOAD_SIZE_BYTES },
      );

      // Cloud providers return an absolute presigned URL; the local provider
      // returns a same-origin path. It is deliberately NOT made absolute from
      // PUBLIC_APP_URL: a relative path always resolves against the origin the
      // student is actually using, so an alias host or proxy misconfiguration
      // can never point the upload somewhere else.
      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve private object entities (e.g. Academic Progress Reports). Owner-only.
 */
router.get(
  '/storage/objects/*path',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const storage = await getPrivateObjectStorage();

      const canAccess = await storage.canRead(objectPath, req.userId);
      if (!canAccess) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const obj = await storage.downloadObject(objectPath);
      sendPrivateFile(res, obj, (err) =>
        req.log.error({ err }, 'Error streaming private object'),
      );
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, 'Object not found');
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      req.log.error({ err: error }, 'Error serving object');
      res.status(500).json({ error: 'Failed to serve object' });
    }
  },
);

/**
 * PUT /storage/local-upload/:token
 *
 * Receiving end of the signed upload link minted by the local-filesystem
 * storage provider. Deliberately NOT behind requireAuth: like a presigned
 * cloud URL, possession of the unexpired, HMAC-signed token IS the
 * authorization (the token is only ever minted for an authenticated user
 * by /storage/uploads/request-url, is bound to one objectPath, one size cap
 * and one content type, and expires in 15 minutes). Returns 404 unless the
 * local provider is the one in use, so it is inert on other platforms.
 */
router.put(
  '/storage/local-upload/:token',
  async (req: Request, res: Response) => {
    if (resolveStorageProvider() !== 'local' || !isPrivateStorageConfigured()) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    try {
      const storage = await getPrivateObjectStorage();
      const { LocalFilesystemObjectStorageProvider } = await import('../lib/storage/localProvider');
      if (!(storage instanceof LocalFilesystemObjectStorageProvider)) {
        res.status(404).json({ error: 'Not Found' });
        return;
      }
      const token = String(req.params.token ?? '');
      const result = await storage.receiveUpload(token, req);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, 'Error receiving local upload');
      res.status(500).json({ error: 'Failed to store upload' });
    }
  },
);

export default router;
