import * as auditService from '../services/audit.service.js';
import { successResponse } from '../utils/response.js';

export const getAuditLogs = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const logs = await auditService.getTeamAuditLogs(teamId, limit);
    return successResponse(res, logs, 'Audit logs retrieved');
  } catch (err) {
    next(err);
  }
};

