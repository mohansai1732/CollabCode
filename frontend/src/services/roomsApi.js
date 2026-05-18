import api from './api';

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc
} from "firebase/firestore";

import { db } from "../config/firebase";

export const fetchUserRooms = async (userId) => {
  const response = await api.get(`/rooms/${userId}`);
  return response.data.rooms;
};

export const createRoom = async (userId, name) => {
  const response = await api.post('/rooms', { userId, name });
  return response.data;
};

export const fetchRoomById =
async (roomId) => {

  const response =
    await api.get(`/rooms/find/${roomId}`);

  return response.data.room;
};

export const joinRoom = async (userId, roomId) => {
  const response = await api.post('/rooms/join', { userId, roomId });
  return response.data;
};

export const deleteRoom = async (roomId, userId) => {
  const response = await api.delete(`/rooms/${roomId}?userId=${userId}`);
  return response.data;
};

export const fetchMyRequests =
async (userId) => {

  const q = query(
    collection(
      db,
      "joinRequests"
    ),
    where(
      "userId",
      "==",
      userId
    )
  );

  const snapshot =
    await getDocs(q);

  return snapshot.docs.map(
    doc => ({
      id: doc.id,
      ...doc.data()
    })
  );
};

export const cancelJoinRequest =
async (requestId) => {

  await deleteDoc(
    doc(db, 'joinRequests', requestId)
  );
};

export const createJoinRequest =
async (
  user,
  room
) => {

  const docRef =
    await addDoc(
      collection(
        db,
        "joinRequests"
      ),
      {
        roomId: room.id,
        roomName: room.name,
        roomLanguage:
          room.language || "javascript",

        roomOwner:
          room.ownerId,

        userId: user.id,

        userName:
          user.fullName,

        status: "pending",

        createdAt:
          Date.now()
      }
    );

  return docRef.id;
};

export const fetchRoomRequests =
async (ownerId) => {

  const q = query(
    collection(db, "joinRequests"),
    where(
      "roomOwner",
      "==",
      ownerId
    )
  );

  const snapshot =
    await getDocs(q);

  return snapshot.docs.map(
    doc => ({
      id: doc.id,
      ...doc.data()
    })
  );
};

export const approveJoinRequest =
async (request) => {

  // actually add user to room
  await joinRoom(
    request.userId,
    request.roomId
  );

  // remove request after approval
  await deleteDoc(
    doc(db, 'joinRequests', request.id)
  );
};

export const rejectJoinRequest =
async (requestId) => {

  await deleteDoc(
    doc(db, 'joinRequests', requestId)
  );
};