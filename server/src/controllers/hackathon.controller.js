import * as hackathonService from '../services/hackathon.service.js';
import { successResponse } from '../utils/response.js';

export const getHackathons = async (req, res, next) => {
  try {
    const hackathons = await hackathonService.getAllHackathons();
    return successResponse(res, hackathons, 'Hackathons retrieved');
  } catch (err) {
    next(err);
  }
};

export const getHackathon = async (req, res, next) => {
  try {
    const hackathon = await hackathonService.getHackathonById(req.params.id);
    return successResponse(res, hackathon, 'Hackathon details retrieved');
  } catch (err) {
    next(err);
  }
};

