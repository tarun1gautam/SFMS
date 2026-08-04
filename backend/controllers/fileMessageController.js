/**
 * controllers/fileMessageController.js
 *
 * Express controller for sending files as chat messages, fetching conversations,
 * managing read receipts, reactions, and soft-deletions with real-time Socket.IO broadcasts.
 */

const { getSocketIO } = require('../sockets/socketHandler'); // Standard Socket.IO instance provider
const { logAction } = require('../utils/auditLogger');
const fileMessageService = require('../services/fileMessageService'); // Delegated business logic layer

/**
 * Sends a reference to an existing SFMS file as a message in a conversation.
 * 
 * @route POST /api/messages/file-reference
 */
const sendFileReference = async (req, res, next) => {
  try {
    const senderId = req.user.user_id;
    const { recipientId, fileId, content } = req.body;

    if (!recipientId || typeof recipientId !== 'string') {
      return res.status(400).json({ success: false, error: 'Recipient ID is required.' });
    }

    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ success: false, error: 'File ID is required.' });
    }

    const message = await fileMessageService.createFileReferenceMessage({
      senderId,
      recipientId,
      fileId,
      content: content ? String(content).trim() : null
    });

    // Real-time notification via Socket.IO
    const io = getSocketIO();
    if (io) {
      io.to(`user:${recipientId}`).emit('message:new', message);
      io.to(`user:${senderId}`).emit('message:sent', message);
    }

    await logAction({
      req,
      action: 'message.send_file_reference',
      targetType: 'file',
      targetId: fileId,
      metadata: { recipientId, messageId: message.id }
    });

    return res.status(201).json({
      success: true,
      message: 'File reference message sent successfully.',
      data: message
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Uploads a new file and sends it directly as a chat message.
 * Utilizes pre-processed multer upload metadata on req.file.
 * 
 * @route POST /api/messages/upload
 */
const sendUploadedFile = async (req, res, next) => {
  try {
    const senderId = req.user.user_id;
    const { recipientId, content, visibility = 'private' } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file was uploaded.' });
    }

    if (!recipientId || typeof recipientId !== 'string') {
      return res.status(400).json({ success: false, error: 'Recipient ID is required.' });
    }

    const result = await fileMessageService.processUploadAndSendMessage({
      senderId,
      recipientId,
      file: req.file,
      content: content ? String(content).trim() : null,
      visibility,
      uploaderIp: req.ip
    });

    // Real-time notification via Socket.IO
    const io = getSocketIO();
    if (io) {
      io.to(`user:${recipientId}`).emit('message:new', result.message);
      io.to(`user:${senderId}`).emit('message:sent', result.message);
    }

    await logAction({
      req,
      action: 'message.send_uploaded_file',
      targetType: 'file',
      targetId: result.file.id,
      targetLabel: result.file.original_name,
      metadata: { recipientId, messageId: result.message.id, fileSize: req.file.size }
    });

    return res.status(201).json({
      success: true,
      message: 'File uploaded and sent as message.',
      data: result
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Retrieves a paginated list of chat messages between the current user and a target user.
 * 
 * @route GET /api/messages/conversation/:userId
 */
const getConversation = async (req, res, next) => {
  try {
    const currentUserId = req.user.user_id;
    const targetUserId = req.params.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'Target User ID is required.' });
    }

    const conversationData = await fileMessageService.fetchPaginatedConversation({
      currentUserId,
      targetUserId,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: conversationData.messages,
      pagination: conversationData.pagination
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Retrieves a list of recent conversation partners along with unread message counts.
 * 
 * @route GET /api/messages/conversations/recent
 */
const getRecentConversations = async (req, res, next) => {
  try {
    const currentUserId = req.user.user_id;
    const conversations = await fileMessageService.fetchRecentConversations(currentUserId);

    return res.status(200).json({
      success: true,
      data: conversations
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Marks one or multiple messages from a sender as seen/read.
 * 
 * @route PATCH /api/messages/seen
 */
const markAsSeen = async (req, res, next) => {
  try {
    const currentUserId = req.user.user_id;
    const { messageIds, senderId } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, error: 'An array of messageIds is required.' });
    }

    const updatedInfo = await fileMessageService.markMessagesAsSeen({
      recipientId: currentUserId,
      senderId,
      messageIds
    });

    // Real-time broadcast to the original sender that their messages were read
    const io = getSocketIO();
    if (io && senderId) {
      io.to(`user:${senderId}`).emit('messages:seen', {
        seenBy: currentUserId,
        messageIds
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Messages marked as seen.',
      data: updatedInfo
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Adds an emoji reaction to a specific message.
 * 
 * @route POST /api/messages/:messageId/reactions
 */
const addReaction = async (req, res, next) => {
  try {
    const currentUserId = req.user.user_id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ success: false, error: 'Emoji character is required.' });
    }

    const reactionData = await fileMessageService.addReactionToMessage({
      userId: currentUserId,
      messageId,
      emoji: emoji.trim()
    });

    // Broadcast reaction update to participants
    const io = getSocketIO();
    if (io && reactionData.participants) {
      reactionData.participants.forEach((participantId) => {
        io.to(`user:${participantId}`).emit('message:reaction_added', {
          messageId,
          userId: currentUserId,
          emoji
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reaction added successfully.',
      data: reactionData.reaction
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Removes an emoji reaction from a specific message.
 * 
 * @route DELETE /api/messages/:messageId/reactions
 */
const removeReaction = async (req, res, next) => {
  try {
    const currentUserId = req.user.user_id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ success: false, error: 'Emoji character is required.' });
    }

    const reactionData = await fileMessageService.removeReactionFromMessage({
      userId: currentUserId,
      messageId,
      emoji: emoji.trim()
    });

    // Broadcast reaction removal to participants
    const io = getSocketIO();
    if (io && reactionData.participants) {
      reactionData.participants.forEach((participantId) => {
        io.to(`user:${participantId}`).emit('message:reaction_removed', {
          messageId,
          userId: currentUserId,
          emoji
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reaction removed successfully.'
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Soft deletes a message for the requesting user.
 * 
 * @route DELETE /api/messages/:messageId
 */
const softDeleteMessage = async (req, res, next) => {
  try {
    const currentUserId = req.user.user_id;
    const { messageId } = req.params;

    const deleteInfo = await fileMessageService.softDeleteMessageForUser({
      userId: currentUserId,
      messageId
    });

    // Real-time broadcast for synchronized UI deletion on active user client sessions
    const io = getSocketIO();
    if (io) {
      io.to(`user:${currentUserId}`).emit('message:deleted', { messageId });
    }

    await logAction({
      req,
      action: 'message.soft_delete',
      targetType: 'system',
      targetId: messageId,
      metadata: { deletedBy: currentUserId }
    });

    return res.status(200).json({
      success: true,
      message: 'Message deleted successfully.'
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * Retrieves the total count of unread messages for the logged-in user.
 * 
 * @route GET /api/messages/unread-count
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const currentUserId = req.user.user_id;
    const count = await fileMessageService.getUnreadMessageCount(currentUserId);

    return res.status(200).json({
      success: true,
      count: count || 0
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
};

module.exports = {
  sendFileReference,
  sendUploadedFile,
  getConversation,
  getRecentConversations,
  markAsSeen,
  addReaction,
  removeReaction,
  softDeleteMessage,
  getUnreadCount
};