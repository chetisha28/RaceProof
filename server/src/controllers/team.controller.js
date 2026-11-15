import * as teamService from '../services/team.service.js';
import { successResponse } from '../utils/response.js';

export const createTeam = async (req, res, next) => {
  try {
    const team = await teamService.createTeam({
      ...req.body,
      leaderId: req.user.id,
    });
    return successResponse(res, team, 'Team created successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const getTeams = async (req, res, next) => {
  try {
    const result = await teamService.getTeams(req.query);
    return successResponse(res, result.teams, 'Teams retrieved', 200, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const getTeam = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const team = await teamService.getTeamById(req.params.id, userId);
    return successResponse(res, team, 'Team details retrieved');
  } catch (err) {
    next(err);
  }
};

export const updateTeam = async (req, res, next) => {
  try {
    const updated = await teamService.updateTeam(req.params.id, req.user.id, req.body);
    return successResponse(res, updated, 'Team updated successfully');
  } catch (err) {
    next(err);
  }
};

export const disbandTeam = async (req, res, next) => {
  try {
    const result = await teamService.disbandTeam(req.params.id, req.user.id);
    return successResponse(res, result, 'Team disbanded successfully');
  } catch (err) {
    next(err);
  }
};

export const getSuggestions = async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
    const suggestions = await teamService.getTeamSuggestions(req.params.id, limit);
    return successResponse(res, suggestions, 'Teammate suggestions retrieved');
  } catch (err) {
    next(err);
  }
};
