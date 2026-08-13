import api from './api';

export const fetchUserRooms = async (userId, userName) => {
  const { data } = await api.get(`/rooms/${userId}`, { params: { userName },});
  return data.rooms;
};

export const createRoom = async (userId, name, ownerName) => {
  const { data } = await api.post('/rooms', { userId, name, ownerName});
  return data;
};

export const deleteRoom = async (roomId, userId) => {
  const { data } = await api.delete(`/rooms/${roomId}`, { params: { userId } });
  return data;
};

export const fetchRoomById = async (roomId, userId) => {
  const { data } = await api.get(`/rooms/find/${roomId}`, { params: { userId } });
  return data.room;
};

export const createJoinRequest = async (user, room) => {
  const { data } = await api.post('/rooms/join', { roomId: room.id, userId: user.id });
  return data;
};

export const fetchRoomRequests = async (roomId, userId) => {
  const { data } = await api.get(`/rooms/${roomId}/requests`, { params: { userId } });
  return (data.requests || []).map(request => ({ ...request, roomId }));
};

export const fetchMyRequests = async (userId) => {
  const { data } = await api.get(`/rooms/my-requests/${userId}`);
  return data.requests || [];
};

export const cancelJoinRequest = async (requestId, userId) => {
  const { data } = await api.delete(`/rooms/my-requests/${requestId}`,{ data: { userId } });
  return data;
};

export const approveJoinRequest = async (request ,actorId) => {
    const { data } = await api.post( `/rooms/${request.roomId}/requests/${request.userId}`, { accept: true, userId: actorId });
  return data;
};

export const rejectJoinRequest = async (request, actorId) => {
    const { data } = await api.post(`/rooms/${request.roomId}/requests/${request.userId}`, { accept: false, userId: actorId });
    return data;
};

export const removeCollaborator = async (roomId, targetUserId, actorId) => {
    const { data } = await api.delete(`/rooms/${roomId}/collaborators/${targetUserId}`, { data: { userId: actorId } });
    return data;
};

export const setCollaboratorMuted = async (roomId, targetUserId, muted, actorId) => {
    const { data } = await api.patch(`/rooms/${roomId}/collaborators/${targetUserId}/mute`, { muted, userId: actorId });
    return data;
};

export const upgradeSubscription = async userId => {
    const { data } = await api.post('/rooms/subscription/upgrade', { userId });
    return data;
};