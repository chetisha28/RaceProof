import EventEmitter from 'events';

class DomainEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners for concurrent SSE clients
    this.setMaxListeners(200);
  }
}

export const eventEmitter = new DomainEventEmitter();

export const DOMAIN_EVENTS = {
  TEAM_CREATED: 'team:created',
  TEAM_UPDATED: 'team:updated',
  TEAM_DISBANDED: 'team:disbanded',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  LEADERSHIP_TRANSFERRED: 'leadership:transferred',
  REQUEST_CREATED: 'request:created',
  REQUEST_ACCEPTED: 'request:accepted',
  REQUEST_DECLINED: 'request:declined',
  REQUEST_CANCELLED: 'request:cancelled',
  INVITE_CREATED: 'invite:created',
};

