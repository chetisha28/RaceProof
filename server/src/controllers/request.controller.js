import * as requestService from '../services/request.service.js';
import * as concurrencyService from '../services/concurrency.service.js';
import { successResponse } from '../utils/response.js';

export const createRequest = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const request = await requestService.createJoinRequest(teamId, req.user.id, req.body.message);
    return successResponse(res, request, 'Join request submitted', 201);
  } catch (err) {
    next(err);
  }
};

export const getTeamRequests = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const requests = await requestService.getTeamRequests(teamId, req.user.id);
    return successResponse(res, requests, 'Team requests retrieved');
  } catch (err) {
    next(err);
  }
};

export const getMyRequests = async (req, res, next) => {
  try {
    const requests = await requestService.getMyRequests(req.user.id);
    return successResponse(res, requests, 'User requests retrieved');
  } catch (err) {
    next(err);
  }
};

export const acceptRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const result = await concurrencyService.acceptJoinRequestWithLock(requestId, req.user.id);
    return successResponse(res, result, 'Join request accepted and member added successfully');
  } catch (err) {
    next(err);
  }
};

export const declineRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const result = await requestService.declineJoinRequest(requestId, req.user.id);
    return successResponse(res, result, 'Join request declined');
  } catch (err) {
    next(err);
  }
};

export const cancelRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const result = await requestService.cancelJoinRequest(requestId, req.user.id);
    return successResponse(res, result, 'Join request cancelled');
  } catch (err) {
    next(err);
  }
};

