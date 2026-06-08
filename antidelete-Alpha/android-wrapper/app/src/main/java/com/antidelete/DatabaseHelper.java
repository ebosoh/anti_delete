package com.antidelete;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

public class DatabaseHelper extends SQLiteOpenHelper {

    private static final String DATABASE_NAME = "antidelete.db";
    private static final int DATABASE_VERSION = 2; // Upgraded from 1 to support app_source column

    public static final String TABLE_MESSAGES = "messages";
    public static final String COLUMN_ID = "id";
    public static final String COLUMN_SENDER = "sender";
    public static final String COLUMN_CONTENT = "content";
    public static final String COLUMN_TIMESTAMP = "timestamp";
    public static final String COLUMN_IS_DELETED = "is_deleted";
    public static final String COLUMN_APP_SOURCE = "app_source";

    public DatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        String createTable = "CREATE TABLE " + TABLE_MESSAGES + " (" +
                COLUMN_ID + " INTEGER PRIMARY KEY AUTOINCREMENT, " +
                COLUMN_SENDER + " TEXT, " +
                COLUMN_CONTENT + " TEXT, " +
                COLUMN_TIMESTAMP + " INTEGER, " +
                COLUMN_IS_DELETED + " INTEGER DEFAULT 0, " +
                COLUMN_APP_SOURCE + " TEXT DEFAULT 'WhatsApp')";
        db.execSQL(createTable);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            try {
                db.execSQL("ALTER TABLE " + TABLE_MESSAGES + " ADD COLUMN " + COLUMN_APP_SOURCE + " TEXT DEFAULT 'WhatsApp'");
            } catch (Exception e) {
                db.execSQL("DROP TABLE IF EXISTS " + TABLE_MESSAGES);
                onCreate(db);
            }
        }
    }

    public synchronized void insertMessage(String sender, String content, long timestamp, String appSource) {
        SQLiteDatabase db = this.getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put(COLUMN_SENDER, sender);
        values.put(COLUMN_CONTENT, content);
        values.put(COLUMN_TIMESTAMP, timestamp);
        values.put(COLUMN_IS_DELETED, 0);
        values.put(COLUMN_APP_SOURCE, appSource);
        db.insert(TABLE_MESSAGES, null, values);
    }

    public synchronized void insertMessage(String sender, String content, long timestamp) {
        insertMessage(sender, content, timestamp, "WhatsApp");
    }

    public synchronized boolean markLastMessageDeleted(String sender, String senderPrefix) {
        SQLiteDatabase db = this.getWritableDatabase();
        
        String query;
        String[] selectionArgs;
        
        if (senderPrefix != null && !senderPrefix.isEmpty()) {
            // Group chat mode: find the last message from this group where the content starts with the sender's prefix
            query = "SELECT " + COLUMN_ID + " FROM " + TABLE_MESSAGES +
                    " WHERE " + COLUMN_SENDER + " = ?" +
                    " AND " + COLUMN_CONTENT + " LIKE ?" +
                    " AND " + COLUMN_IS_DELETED + " = 0" +
                    " ORDER BY " + COLUMN_ID + " DESC LIMIT 1";
            selectionArgs = new String[]{sender, senderPrefix + "%"};
        } else {
            // Direct chat mode: find the last message from this sender
            query = "SELECT " + COLUMN_ID + " FROM " + TABLE_MESSAGES +
                    " WHERE " + COLUMN_SENDER + " = ?" +
                    " AND " + COLUMN_IS_DELETED + " = 0" +
                    " ORDER BY " + COLUMN_ID + " DESC LIMIT 1";
            selectionArgs = new String[]{sender};
        }
        
        Cursor cursor = db.rawQuery(query, selectionArgs);
        int lastId = -1;
        if (cursor.moveToFirst()) {
            lastId = cursor.getInt(0);
        }
        cursor.close();

        // Fallback: If no message was found for this specific sender (which can happen with grouped summaries or layout updates),
        // let's fall back to marking the overall latest un-deleted message in the database.
        if (lastId == -1) {
            String fallbackQuery = "SELECT " + COLUMN_ID + " FROM " + TABLE_MESSAGES +
                    " WHERE " + COLUMN_IS_DELETED + " = 0" +
                    " ORDER BY " + COLUMN_ID + " DESC LIMIT 1";
            Cursor fallbackCursor = db.rawQuery(fallbackQuery, null);
            if (fallbackCursor.moveToFirst()) {
                lastId = fallbackCursor.getInt(0);
            }
            fallbackCursor.close();
        }

        if (lastId != -1) {
            ContentValues values = new ContentValues();
            values.put(COLUMN_IS_DELETED, 1);
            db.update(TABLE_MESSAGES, values, COLUMN_ID + " = " + lastId, null);
            return true;
        }
        return false;
    }

    public synchronized boolean markLastMessageDeleted(String sender) {
        return markLastMessageDeleted(sender, null);
    }

    public synchronized void insertPlaceholderDeletedMessage(String sender, String content, long timestamp, String appSource) {
        SQLiteDatabase db = this.getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put(COLUMN_SENDER, sender);
        values.put(COLUMN_CONTENT, content);
        values.put(COLUMN_TIMESTAMP, timestamp);
        values.put(COLUMN_IS_DELETED, 1);
        values.put(COLUMN_APP_SOURCE, appSource);
        db.insert(TABLE_MESSAGES, null, values);
    }

    public synchronized void insertPlaceholderDeletedMessage(String sender, String content, long timestamp) {
        insertPlaceholderDeletedMessage(sender, content, timestamp, "WhatsApp");
    }

    public synchronized String getMessagesJson() {
        SQLiteDatabase db = this.getReadableDatabase();
        String query = "SELECT * FROM " + TABLE_MESSAGES + " ORDER BY " + COLUMN_TIMESTAMP + " DESC";
        Cursor cursor = db.rawQuery(query, null);

        StringBuilder json = new StringBuilder();
        json.append("[");

        if (cursor.moveToFirst()) {
            int idIndex = cursor.getColumnIndex(COLUMN_ID);
            int senderIndex = cursor.getColumnIndex(COLUMN_SENDER);
            int contentIndex = cursor.getColumnIndex(COLUMN_CONTENT);
            int timestampIndex = cursor.getColumnIndex(COLUMN_TIMESTAMP);
            int isDeletedIndex = cursor.getColumnIndex(COLUMN_IS_DELETED);
            int appSourceIndex = cursor.getColumnIndex(COLUMN_APP_SOURCE);

            do {
                int id = cursor.getInt(idIndex);
                String sender = cursor.getString(senderIndex);
                String content = cursor.getString(contentIndex);
                long timestamp = cursor.getLong(timestampIndex);
                int isDeleted = cursor.getInt(isDeletedIndex);
                String appSource = appSourceIndex != -1 ? cursor.getString(appSourceIndex) : "WhatsApp";
                if (appSource == null) appSource = "WhatsApp";

                if (json.length() > 1) {
                    json.append(",");
                }

                json.append("{")
                    .append("\"id\":").append(id).append(",")
                    .append("\"sender\":\"").append(escapeJson(sender)).append("\",")
                    .append("\"content\":\"").append(escapeJson(content)).append("\",")
                    .append("\"timestamp\":").append(timestamp).append(",")
                    .append("\"is_deleted\":").append(isDeleted).append(",")
                    .append("\"app_source\":\"").append(escapeJson(appSource)).append("\"")
                    .append("}");

            } while (cursor.moveToNext());
        }
        cursor.close();
        json.append("]");
        return json.toString();
    }

    // Helper to escape string for JSON output manually (keeping it light without external libs)
    private String escapeJson(String str) {
        if (str == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < str.length(); i++) {
            char ch = str.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < ' ') {
                        String t = "000" + Integer.toHexString(ch);
                        sb.append("\\u").append(t.substring(t.length() - 4));
                    } else {
                        sb.append(ch);
                    }
            }
        }
        return sb.toString();
    }
}
