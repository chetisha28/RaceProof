import * as inviteService from '../services/invite.service.js';
import * as concurrencyService from '../services/concurrency.service.js';
import { successResponse } from '../utils/response.js';

export const createInvite = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const expiresInHours = req.body.expiresInHours || 24;
    const invite = await inviteService.createInvite(teamId, req.user.id, expiresInHours);
    return successResponse(res, invite, 'Invitation link created', 201);
  } catch (err) {
    next(err);
  }
};

export const getInvite = async (req, res, next) => {
  try {
    const { token } = req.params;
    const details = await inviteService.getInviteDetails(token);
    return successResponse(res, details, 'Invite details retrieved');
  } catch (err) {
    next(err);
  }
};

export const acceptInvite = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await concurrencyService.acceptInviteWithLock(token, req.user.id);
    return successResponse(res, result, 'Successfully joined team via invitation');
  } catch (err) {
    next(err);
  }
};

