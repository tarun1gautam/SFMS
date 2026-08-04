/**
 * backend/services/fileMessageService.js
 *
 * Core business logic layer for SFMS file-based direct chat messaging.
 * Handles database operations, permission checks, file attachment creation,
 * reaction management, read receipt processing, and user-scoped soft deletions.
 *
 * Strictly decoupled from Express request/response objects and Socket.IO emitters.
 */

const pool = require('../config/db');
const fileController = require('../controllers/fileController');
const uploadQueue = require('../queues/uploadQueue');

/**
 * Standardized custom domain error helper.
 */
class ServiceError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Supported reaction emojis.
 */
const SUPPORTED_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉']);

/**
 * Helper to build SQL parameters and clauses safely.
 */
const createError = (message, statusCode) => new ServiceError(message, statusCode);

/**
 * Normalizes DB file record metadata into standard frontend schema.
 */
const formatFileMetadata = (row) => {
  if (!row || !row.file_id) return null;
  return {
    id: row.file_id,
    fileName: row.file_name,
    originalName: row.file_original_name,
    filePath: row.file_path,
    fileSize: row.file_size ? parseInt(row.file_size, 10) : 0,
    mimeType: row.mime_type,
    uploadedBy: row.file_uploaded_by,
    visibility: row.file_visibility,
    virtualPath: row.file_virtual_path,
    uploadTimestamp: row.file_upload_timestamp,
    fileHash: row.file_hash,
    hasPreview: row.mime_type ? (row.mime_type.startsWith('image/') || row.mime_type === 'application/pdf') : false,
    previewUrl: row.mime_type && row.mime_type.startsWith('image/') ? `/api/files/download/${row.file_id}?mode=view` : null
  };
};

/**
 * Transforms raw database query row into a frontend-ready Message DTO.
 */
const formatMessageDTO = (row, currentUserId) => {
  const isSender = row.sender_id === currentUserId;
  
  // Format aggregated emoji reactions
  let reactions = [];
  if (Array.isArray(row.reactions_raw) && row.reactions_raw.length > 0) {
    const reactionMap = {};
    row.reactions_raw.forEach((r) => {
      if (!r || !r.emoji) return;
      if (!reactionMap[r.emoji]) {
        reactionMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      }
      reactionMap[r.emoji].count += 1;
      reactionMap[r.emoji].users.push(r.user_id);
    });
    reactions = Object.values(reactionMap).map((item) => ({
      ...item,
      hasReacted: item.users.includes(currentUserId)
    }));
  }

  // Determine file access permissions for current user
  const fileMeta = formatFileMetadata(row);
  let canDownload = false;
  if (fileMeta) {
    const isOwner = fileMeta.uploadedBy === currentUserId;
    const isPublic = fileMeta.visibility === 'public' || fileMeta.visibility === 'directory';
    const isTargeted = Array.isArray(row.file_target_users) && row.file_target_users.includes(currentUserId);
    canDownload = isSender || isOwner || isPublic || isTargeted;
  }

  return {
    id: row.id,
    senderId: row.sender_id,
    sender: {
      userId: row.sender_id,
      username: row.sender_username || row.sender_id,
      role: row.sender_role || 'user'
    },
    recipientId: row.recipient_id,
    recipient: {
      userId: row.recipient_id,
      username: row.recipient_username || row.recipient_id,
      role: row.recipient_role || 'user'
    },
    content: row.content || '',
    isReference: row.is_reference || false,
    file: fileMeta,
    permissions: {
      canDownload,
      isSender
    },
    deliveryStatus: row.is_seen ? 'seen' : 'delivered',
    isSeen: !!row.is_seen,
    seenAt: row.seen_at || null,
    reactions,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * 1. Creates a message referencing an existing file in SFMS.
 */
const createFileReferenceMessage = async ({ senderId, recipientId, fileId, content }) => {
  if (senderId === recipientId) {
    throw createError('You cannot send messages to yourself.', 400);
  }

  // Verify recipient exists
  const recipientRes = await pool.query('SELECT user_id FROM users WHERE user_id = $1 LIMIT 1', [recipientId]);
  if (recipientRes.rows.length === 0) {
    throw createError('Recipient user does not exist.', 404);
  }

  // Fetch file metadata and evaluate permissions
  const fileRes = await pool.query('SELECT * FROM files WHERE id = $1 LIMIT 1', [fileId]);
  if (fileRes.rows.length === 0) {
    throw createError('Referenced file does not exist.', 404);
  }
  const file = fileRes.rows[0];

  const isOwner = file.uploaded_by === senderId;
  const isPublic = file.visibility === 'public' || file.visibility === 'directory';
  const isTargeted = Array.isArray(file.target_users) && file.target_users.includes(senderId);

  if (!isOwner && !isPublic && !isTargeted) {
    throw createError('Access denied: You do not have permission to share this file.', 403);
  }

  // Insert message record referencing existing file
  const insertQuery = `
    INSERT INTO file_messages (
      sender_id, recipient_id, file_id, content, is_reference
    )
    VALUES ($1, $2, $3, $4, true)
    RETURNING id;
  `;
  const insertRes = await pool.query(insertQuery, [senderId, recipientId, fileId, content]);
  const messageId = insertRes.rows[0].id;

  // Retrieve complete formatted message object
  const fullMessage = await getSingleMessageById(messageId, senderId);
  return fullMessage;
};

/**
 * 2. Uploads a new file via existing SFMS pipeline and creates an associated message.
 */
/**
 * 2. Uploads a new file via existing SFMS pipeline and creates an associated message.
 */
const processUploadAndSendMessage = async ({ senderId, recipientId, file, content, visibility = 'private', uploaderIp }) => {
  if (senderId === recipientId) {
    throw createError('You cannot send messages to yourself.', 400);
  }

  // Verify recipient exists
  const recipientRes = await pool.query('SELECT user_id FROM users WHERE user_id = $1 LIMIT 1', [recipientId]);
  if (recipientRes.rows.length === 0) {
    throw createError('Recipient user does not exist.', 404);
  }

  // 1. Properly construct reqContext to mimic an Express request object with req.file and req.body attached
  const reqContext = {
    user: { user_id: senderId, role: 'user' },
    ip: uploaderIp,
    headers: {},
    socket: {},
    file: file, // <-- CRITICAL FIX: Attach Multer file object here so req.file is defined
    body: {
      visibility,
      target_users: JSON.stringify([recipientId]),
      virtual_path: '77820e7c-e8ca-4467-8f43-9c131c7fb722', // Standard default chat attachments folder
      description: `Direct message attachment to ${recipientId}`
    }
  };

  // Safely resolve the upload handler function from fileController
  const uploadHandler = fileController.processUpload || fileController.uploadFile || fileController;

  // 2. Call uploadHandler with reqContext (Express req) and null/mock response
  const fileRecord = await uploadQueue.enqueue(
    { userId: senderId, socketId: null, fileName: file.originalname },
    () => uploadHandler(reqContext, null) // Pass reqContext as 1st argument (req)
  );

  // Link uploaded file to a new file message record
  const insertQuery = `
    INSERT INTO file_messages (
      sender_id, recipient_id, file_id, content, is_reference
    )
    VALUES ($1, $2, $3, $4, false)
    RETURNING id;
  `;
  const insertRes = await pool.query(insertQuery, [senderId, recipientId, fileRecord.id || fileRecord.file_id || fileRecord, content]);
  const messageId = insertRes.rows[0].id;

  const formattedMessage = await getSingleMessageById(messageId, senderId);

  return {
    message: formattedMessage,
    file: fileRecord
  };
};

/**
 * 3. Fetches paginated chat conversation between two users with optimizations to prevent N+1 queries.
 */
const fetchPaginatedConversation = async ({ currentUserId, targetUserId, page = 1, limit = 30 }) => {
  const offset = (page - 1) * limit;

  // Count total non-deleted messages in conversation
  const countQuery = `
    SELECT COUNT(*) 
    FROM file_messages 
    WHERE ((sender_id = $1 AND recipient_id = $2 AND sender_deleted = false)
       OR (sender_id = $2 AND recipient_id = $1 AND receiver_deleted = false));
  `;
  const countRes = await pool.query(countQuery, [currentUserId, targetUserId]);
  const total = parseInt(countRes.rows[0].count, 10);

  // Query paginated messages with sender, recipient, file, and aggregated reactions via JOINs
  const fetchQuery = `
    SELECT 
      fm.id,
      fm.sender_id,
      fm.recipient_id,
      fm.content,
      fm.is_reference,
      fm.is_seen,
      fm.seen_at,
      fm.created_at,
      fm.updated_at,
      u1.user_id AS sender_username,
      u1.role AS sender_role,
      u2.user_id AS recipient_username,
      u2.role AS recipient_role,
      f.id AS file_id,
      f.file_name,
      f.original_name AS file_original_name,
      f.file_path,
      f.file_size,
      f.mime_type,
      f.uploaded_by AS file_uploaded_by,
      f.visibility AS file_visibility,
      f.virtual_path AS file_virtual_path,
      f.upload_timestamp AS file_upload_timestamp,
      f.file_hash,
      f.target_users AS file_target_users,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT('emoji', mr.emoji, 'user_id', mr.user_id)
        ) FILTER (WHERE mr.id IS NOT NULL), '[]'
      ) AS reactions_raw
    FROM file_messages fm
    LEFT JOIN users u1 ON u1.user_id = fm.sender_id
    LEFT JOIN users u2 ON u2.user_id = fm.recipient_id
    LEFT JOIN files f ON f.id = fm.file_id
    LEFT JOIN message_reactions mr ON mr.message_id = fm.id
    WHERE ((fm.sender_id = $1 AND fm.recipient_id = $2 AND fm.sender_deleted = false)
       OR (fm.sender_id = $2 AND fm.recipient_id = $1 AND fm.receiver_deleted = false))
    GROUP BY fm.id, u1.user_id, u1.role, u2.user_id, u2.role, f.id
    ORDER BY fm.created_at DESC
    LIMIT $3 OFFSET $4;
  `;

  const messagesRes = await pool.query(fetchQuery, [currentUserId, targetUserId, limit, offset]);

  // Format messages chronologically
  const messages = messagesRes.rows
    .map((row) => formatMessageDTO(row, currentUserId))
    .reverse();

  return {
    messages,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * 4. Fetches recent conversation partners with last message details and unread counts.
 */
const fetchRecentConversations = async (currentUserId) => {
  const query = `
    WITH DistinctPartners AS (
      SELECT DISTINCT 
        CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS partner_id
      FROM file_messages
      WHERE (sender_id = $1 AND sender_deleted = false)
         OR (recipient_id = $1 AND receiver_deleted = false)
    ),
    LatestMessages AS (
      SELECT DISTINCT ON (
        CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END
      )
        fm.id,
        fm.sender_id,
        fm.recipient_id,
        fm.content,
        fm.created_at,
        fm.is_seen,
        fm.file_id,
        f.file_name,
        f.mime_type,
        CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS partner_id
      FROM file_messages fm
      LEFT JOIN files f ON f.id = fm.file_id
      WHERE (fm.sender_id = $1 AND fm.sender_deleted = false)
         OR (fm.recipient_id = $1 AND fm.receiver_deleted = false)
      ORDER BY partner_id, fm.created_at DESC
    ),
    UnreadCounts AS (
      SELECT 
        sender_id AS partner_id, 
        COUNT(*) AS unread_count
      FROM file_messages
      WHERE recipient_id = $1 
        AND is_seen = false 
        AND receiver_deleted = false
      GROUP BY sender_id
    )
    SELECT 
      dp.partner_id,
      u.user_id AS partner_username,
      u.role AS partner_role,
      lm.id AS last_message_id,
      lm.sender_id AS last_message_sender_id,
      lm.content AS last_message_content,
      lm.created_at AS last_activity_timestamp,
      lm.file_id,
      lm.file_name,
      lm.mime_type,
      COALESCE(uc.unread_count, 0) AS unread_count
    FROM DistinctPartners dp
    JOIN users u ON u.user_id = dp.partner_id
    LEFT JOIN LatestMessages lm ON lm.partner_id = dp.partner_id
    LEFT JOIN UnreadCounts uc ON uc.partner_id = dp.partner_id
    ORDER BY lm.created_at DESC NULLS LAST;
  `;

  const res = await pool.query(query, [currentUserId]);

  return res.rows.map((row) => ({
    partner: {
      userId: row.partner_id,
      username: row.partner_username || row.partner_id,
      role: row.partner_role || 'user',
      isOnline: false // Can be augmented by active Socket.IO connection presence maps
    },
    lastMessage: {
      id: row.last_message_id,
      senderId: row.last_message_sender_id,
      content: row.last_message_content,
      createdAt: row.last_activity_timestamp,
      file: row.file_id
        ? {
            id: row.file_id,
            fileName: row.file_name,
            mimeType: row.mime_type
          }
        : null
    },
    unreadCount: parseInt(row.unread_count, 10),
    lastActivityTimestamp: row.last_activity_timestamp
  }));
};

/**
 * 5. Marks specific unread messages sent to the current user as seen within an atomic transaction.
 */
const markMessagesAsSeen = async ({ recipientId, senderId, messageIds }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let updateQuery = `
      UPDATE file_messages
      SET is_seen = true, seen_at = NOW(), updated_at = NOW()
      WHERE recipient_id = $1
        AND is_seen = false
        AND id = ANY($2::uuid[])
    `;
    const params = [recipientId, messageIds];

    if (senderId) {
      updateQuery += ` AND sender_id = $3`;
      params.push(senderId);
    }

    updateQuery += ` RETURNING id, sender_id;`;

    const result = await client.query(updateQuery, params);
    await client.query('COMMIT');

    const updatedMessageIds = result.rows.map((r) => r.id);

    return {
      updatedMessageIds,
      count: updatedMessageIds.length,
      recipientId
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * 6. Adds or updates an emoji reaction on a message and returns participant IDs for socket notifications.
 */
const addReactionToMessage = async ({ userId, messageId, emoji }) => {
  if (!SUPPORTED_EMOJIS.has(emoji)) {
    throw createError('Unsupported emoji reaction.', 400);
  }

  // Confirm message existence and retrieve conversation participant IDs
  const msgRes = await pool.query(
    'SELECT id, sender_id, recipient_id FROM file_messages WHERE id = $1 LIMIT 1',
    [messageId]
  );
  if (msgRes.rows.length === 0) {
    throw createError('Message not found.', 404);
  }
  const msg = msgRes.rows[0];

  if (msg.sender_id !== userId && msg.recipient_id !== userId) {
    throw createError('Access denied.', 403);
  }

  // UPSERT reaction record
  const upsertQuery = `
    INSERT INTO message_reactions (message_id, user_id, emoji)
    VALUES ($1, $2, $3)
    ON CONFLICT (message_id, user_id, emoji) 
    DO UPDATE SET created_at = NOW()
    RETURNING id, message_id, user_id, emoji, created_at;
  `;
  const reactionRes = await pool.query(upsertQuery, [messageId, userId, emoji]);

  return {
    reaction: reactionRes.rows[0],
    participants: [msg.sender_id, msg.recipient_id]
  };
};

/**
 * 7. Removes an emoji reaction from a message.
 */
const removeReactionFromMessage = async ({ userId, messageId, emoji }) => {
  const msgRes = await pool.query(
    'SELECT id, sender_id, recipient_id FROM file_messages WHERE id = $1 LIMIT 1',
    [messageId]
  );
  if (msgRes.rows.length === 0) {
    throw createError('Message not found.', 404);
  }
  const msg = msgRes.rows[0];

  if (msg.sender_id !== userId && msg.recipient_id !== userId) {
    throw createError('Access denied.', 403);
  }

  const deleteQuery = `
    DELETE FROM message_reactions
    WHERE message_id = $1 AND user_id = $2 AND emoji = $3
    RETURNING id;
  `;
  const deleteRes = await pool.query(deleteQuery, [messageId, userId, emoji]);

  if (deleteRes.rows.length === 0) {
    throw createError('Reaction does not exist.', 404);
  }

  return {
    participants: [msg.sender_id, msg.recipient_id]
  };
};

/**
 * 8. Soft deletes a message for the requesting user and marks it eligible for cleanup if both participants delete it.
 */
const softDeleteMessageForUser = async ({ userId, messageId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const msgRes = await client.query(
      'SELECT id, sender_id, recipient_id, sender_deleted, receiver_deleted FROM file_messages WHERE id = $1 FOR UPDATE',
      [messageId]
    );

    if (msgRes.rows.length === 0) {
      throw createError('Message not found.', 404);
    }

    const msg = msgRes.rows[0];
    let isSender = msg.sender_id === userId;
    let isRecipient = msg.recipient_id === userId;

    if (!isSender && !isRecipient) {
      throw createError('Access denied.', 403);
    }

    let newSenderDeleted = msg.sender_deleted;
    let newReceiverDeleted = msg.receiver_deleted;

    if (isSender) newSenderDeleted = true;
    if (isRecipient) newReceiverDeleted = true;

    const isEligibleForCleanup = newSenderDeleted && newReceiverDeleted;

    const updateQuery = `
      UPDATE file_messages
      SET sender_deleted = $1,
          receiver_deleted = $2,
          eligible_for_cleanup = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING id, sender_deleted, receiver_deleted, eligible_for_cleanup;
    `;

    const updateRes = await client.query(updateQuery, [
      newSenderDeleted,
      newReceiverDeleted,
      isEligibleForCleanup,
      messageId
    ]);

    await client.query('COMMIT');

    return updateRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Reusable internal helper for fetching a single formatted message record.
 */
const getSingleMessageById = async (messageId, currentUserId) => {
  const query = `
    SELECT 
      fm.id,
      fm.sender_id,
      fm.recipient_id,
      fm.content,
      fm.is_reference,
      fm.is_seen,
      fm.seen_at,
      fm.created_at,
      fm.updated_at,
      u1.user_id AS sender_username,
      u1.role AS sender_role,
      u2.user_id AS recipient_username,
      u2.role AS recipient_role,
      f.id AS file_id,
      f.file_name,
      f.original_name AS file_original_name,
      f.file_path,
      f.file_size,
      f.mime_type,
      f.uploaded_by AS file_uploaded_by,
      f.visibility AS file_visibility,
      f.virtual_path AS file_virtual_path,
      f.upload_timestamp AS file_upload_timestamp,
      f.file_hash,
      f.target_users AS file_target_users,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT('emoji', mr.emoji, 'user_id', mr.user_id)
        ) FILTER (WHERE mr.id IS NOT NULL), '[]'
      ) AS reactions_raw
    FROM file_messages fm
    LEFT JOIN users u1 ON u1.user_id = fm.sender_id
    LEFT JOIN users u2 ON u2.user_id = fm.recipient_id
    LEFT JOIN files f ON f.id = fm.file_id
    LEFT JOIN message_reactions mr ON mr.message_id = fm.id
    WHERE fm.id = $1
    GROUP BY fm.id, u1.user_id, u1.role, u2.user_id, u2.role, f.id;
  `;

  const res = await pool.query(query, [messageId]);
  if (res.rows.length === 0) {
    throw createError('Message standard retrieval failed.', 404);
  }

  return formatMessageDTO(res.rows[0], currentUserId);
};



const getUnreadMessageCount = async (userId) => {
  // Database query example using PG pool or ORM
  const query = `
    SELECT COUNT(*)::int AS count 
    FROM file_messages 
    WHERE recipient_id = $1 
      AND is_seen = false 
      AND sender_deleted = false;
  `;
  const { rows } = await pool.query(query, [userId]);
  return rows[0]?.count || 0;
};

module.exports = {
  createFileReferenceMessage,
  processUploadAndSendMessage,
  fetchPaginatedConversation,
  fetchRecentConversations,
  markMessagesAsSeen,
  addReactionToMessage,
  removeReactionFromMessage,
  softDeleteMessageForUser,
  getUnreadMessageCount
};