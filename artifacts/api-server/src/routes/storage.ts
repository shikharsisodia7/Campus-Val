import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import { ObjectNotFoundError, getPrivateObjectStorage } from '../lib/storage';

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

      const { stream, contentType, size } = await storage.downloadObject(objectPath);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (size) res.setHeader('Content-Length', String(size));
      stream.pipe(res);
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

export default router;
