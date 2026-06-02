package com.antidelete;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

public class DatabaseHelper extends SQLiteOpenHelper {

    private static final String DATABASE_NAME = "antidelete.db";
    private static final int DATABASE_VERSION = 1;

    public static final String TABLE_MESSAGES = "messages";
    public static final String COLUMN_ID = "id";
    public static final String COLUMN_SENDER = "sender";
    public static final String COLUMN_CONTENT = "content";
    public static final String COLUMN_TIMESTAMP = "timestamp";
    public static final String COLUMN_IS_DELETED = "is_deleted";

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
                COLUMN_IS_DELETED + " INTEGER DEFAULT 0)";
        db.execSQL(createTable);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_MESSAGES);
        onCreate(db);
    }

    public synchronized void insertMessage(String sender, String content, long timestamp) {
        SQLiteDatabase db = this.getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put(COLUMN_SENDER, sender);
        values.put(COLUMN_CONTENT, content);
        values.put(COLUMN_TIMESTAMP, timestamp);
        values.put(COLUMN_IS_DELETED, 0);
        db.insert(TABLE_MESSAGES, null, values);
    }

    public synchronized boolean markLastMessageDeleted(String sender) {
        SQLiteDatabase db = this.getWritableDatabase();
        
        // Find the last message from this sender that is not already marked deleted
        String query = "SELECT " + COLUMN_ID + " FROM " + TABLE_MESSAGES +
                " WHERE " + COLUMN_SENDER + " = ?" +
                " AND " + COLUMN_IS_DELETED + " = 0" +
                " ORDER BY " + COLUMN_ID + " DESC LIMIT 1";
        
        Cursor cursor = db.rawQuery(query, new String[]{sender});
        int lastId = -1;
        if (cursor.moveToFirst()) {
            lastId = cursor.getInt(0);
        }
        cursor.close();

        if (lastId != -1) {
            ContentValues values = new ContentValues();
            values.put(COLUMN_IS_DELETED, 1);
            db.update(TABLE_MESSAGES, values, COLUMN_ID + " = " + lastId, null);
            return true;
        }
        return false;
    }

    public synchronized String getMessagesJson() {
        SQLiteDatabase db = this.getReadableDatabase();
        String query = "SELECT * FROM " + TABLE_MESSAGES + " ORDER BY " + COLUMN_TIMESTAMP + " DESC";
        Cursor cursor = db.rawQuery(query, null);

        StringBuilder json = new StringBuilder();
        json.append("[");

        if (cursor.moveToFirst()) {
            do {
                int id = cursor.getInt(0);
                String sender = cursor.getString(1);
                String content = cursor.getString(2);
                long timestamp = cursor.getLong(3);
                int isDeleted = cursor.getInt(4);

                if (json.length() > 1) {
                    json.append(",");
                }

                json.append("{")
                    .append("\"id\":").append(id).append(",")
                    .append("\"sender\":\"").append(escapeJson(sender)).append("\",")
                    .append("\"content\":\"").append(escapeJson(content)).append("\",")
                    .append("\"timestamp\":").append(timestamp).append(",")
                    .append("\"is_deleted\":").append(isDeleted)
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
