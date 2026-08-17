import admin from '../config/firebaseAdmin.js';
import { clerkClient } from '@clerk/express';

const db = admin.firestore();

// Get Admin Overview Stats
export const getAdminStats = async (req, res) => {
  try {
    const usersCount = (await db.collection('users').count().get()).data().count;
    const roomsCount = (await db.collection('rooms').count().get()).data().count;

    res.json({ usersCount, roomsCount });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
};  

// Get All Users
export const getAllUsers = async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Delete User
export const deleteUserAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Delete from Firebase Firestore
    await db.collection('users').doc(userId).delete();
    
    // Delete from Clerk Authentication
    await clerkClient.users.deleteUser(userId);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Get All Rooms
export const getAllRooms = async (req, res) => {
  try {
    const snapshot = await db.collection('rooms').get();
    const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

// Terminate Room
export const deleteRoomAdmin = async (req, res) => {
  try {
    const { roomId } = req.params;
    await db.collection('rooms').doc(roomId).delete();
    res.json({ success: true, message: 'Room terminated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete room' });
  }
};

// Update User Subscription (Admin)
export const updateSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan, status, expiresAt } = req.body;

    if (!plan || !status) {
      return res.status(400).json({ error: 'Plan and status are required' });
    }

    const subscriptionData = {
      plan,                             // e.g., 'free', 'pro', 'enterprise'
      status,                           // e.g., 'active', 'canceled', 'past_due'
      expiresAt: expiresAt || null,     // ISO string or timestamp
      updatedAt: new Date().toISOString()
    };

    // 1. Update subscription in Firestore (nested under subscription field)
    await db.collection('users').doc(userId).set(
      { subscription: subscriptionData },
      { merge: true }
    );

    // 2. Sync subscription role/plan with Clerk public metadata
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        plan,
        subscriptionStatus: status
      }
    });

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: subscriptionData
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
};