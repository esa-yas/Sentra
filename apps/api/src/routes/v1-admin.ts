import {
  HTTP_HEADERS,
  createPartnerConnectionRequestSchema,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router } from 'express';
import type { Container } from '../container';
import { parseOrThrow } from '../validation';
import { PartnerBootstrapRejected } from '../partner/admin';

export const createPartnerAdminRouter = (container: Container): Router => {
  const router = Router();

  const bootstrap = (req: { header: (name: string) => string | undefined }): void => {
    if (container.partner === undefined) {
      throw new PartnerBootstrapRejected('Partner administration is not configured in this provider mode.');
    }
    container.partner.admin.assertBootstrapAllowed(req.header(HTTP_HEADERS.BOOTSTRAP_TOKEN));
  };

  router.post('/organizations/:organizationId/partner-connections', async (req, res) => {
    bootstrap(req);
    const input = parseOrThrow(createPartnerConnectionRequestSchema, req.body ?? {});
    const created = await container.partner!.admin.createConnection(
      req.params.organizationId,
      input,
      'bootstrap',
    );
    res.status(201).json(created);
  });

  router.post(
    '/organizations/:organizationId/partner-connections/:connectionId/signing-keys',
    async (req, res) => {
      bootstrap(req);
      const issued = await container.partner!.admin.issueKey(
        req.params.organizationId,
        req.params.connectionId,
      );
      res.status(201).json(issued);
    },
  );

  router.post(
    '/organizations/:organizationId/partner-connections/:connectionId/signing-keys/:kid/revoke',
    async (req, res) => {
      bootstrap(req);
      await container.partner!.admin.revokeKey(
        req.params.organizationId,
        req.params.connectionId,
        req.params.kid,
      );
      res.json({ revoked: true, correlationId: getCorrelationId() });
    },
  );

  router.post(
    '/organizations/:organizationId/partner-connections/:connectionId/revoke',
    async (req, res) => {
      bootstrap(req);
      await container.partner!.admin.revokeConnection(req.params.organizationId, req.params.connectionId);
      res.json({ revoked: true, correlationId: getCorrelationId() });
    },
  );

  return router;
};
