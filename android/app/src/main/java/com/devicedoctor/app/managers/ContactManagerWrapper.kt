package com.devicedoctor.app.managers

import android.content.ContentProviderOperation
import android.content.Context
import android.database.Cursor
import android.provider.ContactsContract

/**
 * Contact Manager Wrapper - Handles contact operations
 */
class ContactManagerWrapper(private val context: Context) {

    /**
     * Get all contacts
     */
    fun getAllContacts(params: Map<String, Any>): Map<String, Any> {
        val contacts = mutableListOf<Map<String, Any>>()
        val limit = (params["limit"] as? Double)?.toInt() ?: 100
        val search = params["search"] as? String

        try {
            val uri = ContactsContract.Contacts.CONTENT_URI
            val projection = arrayOf(
                ContactsContract.Contacts._ID,
                ContactsContract.Contacts.DISPLAY_NAME,
                ContactsContract.Contacts.HAS_PHONE_NUMBER,
                ContactsContract.Contacts.STARRED,
                ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP
            )

            var selection: String? = null
            var selectionArgs: Array<String>? = null

            if (search != null) {
                selection = "${ContactsContract.Contacts.DISPLAY_NAME} LIKE ?"
                selectionArgs = arrayOf("%$search%")
            }

            val cursor: Cursor? = context.contentResolver.query(
                uri,
                projection,
                selection,
                selectionArgs,
                "${ContactsContract.Contacts.DISPLAY_NAME} ASC LIMIT $limit"
            )

            cursor?.use {
                while (it.moveToNext()) {
                    val id = it.getString(it.getColumnIndexOrThrow(ContactsContract.Contacts._ID))
                    val displayName = it.getString(it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME))
                    val hasPhone = it.getInt(it.getColumnIndexOrThrow(ContactsContract.Contacts.HAS_PHONE_NUMBER))
                    val starred = it.getInt(it.getColumnIndexOrThrow(ContactsContract.Contacts.STARRED))
                    val lastUpdated = it.getLong(it.getColumnIndexOrThrow(ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP))

                    val phoneNumbers = if (hasPhone > 0) getPhoneNumbers(id) else emptyList()
                    val emails = getEmails(id)

                    contacts.add(
                        mapOf(
                            "id" to id,
                            "displayName" to displayName,
                            "phoneNumbers" to phoneNumbers,
                            "emails" to emails,
                            "starred" to (starred == 1),
                            "lastUpdated" to lastUpdated
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return mapOf(
            "status" to "success",
            "data" to mapOf(
                "contacts" to contacts,
                "total" to contacts.size,
                "hasMore" to (contacts.size == limit)
            )
        )
    }

    /**
     * Get single contact
     */
    fun getContact(contactId: String): Map<String, Any> {
        try {
            val uri = ContactsContract.Contacts.CONTENT_URI
            val selection = "${ContactsContract.Contacts._ID} = ?"
            val selectionArgs = arrayOf(contactId)

            val cursor = context.contentResolver.query(
                uri,
                null,
                selection,
                selectionArgs,
                null
            )

            cursor?.use {
                if (it.moveToFirst()) {
                    val displayName = it.getString(it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME))
                    val phoneNumbers = getPhoneNumbers(contactId)
                    val emails = getEmails(contactId)

                    return mapOf(
                        "status" to "success",
                        "data" to mapOf(
                            "contact" to mapOf(
                                "id" to contactId,
                                "displayName" to displayName,
                                "phoneNumbers" to phoneNumbers,
                                "emails" to emails
                            )
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return mapOf(
            "status" to "error",
            "error" to mapOf(
                "type" to "ContactNotFound",
                "message" to "Contact not found"
            )
        )
    }

    /**
     * Create contact
     */
    fun createContact(body: Map<String, Any>): Map<String, Any> {
        return try {
            val displayName = body["displayName"] as String
            val phoneNumbers = body["phoneNumbers"] as? List<Map<String, String>> ?: emptyList()
            val emails = body["emails"] as? List<Map<String, String>> ?: emptyList()

            val ops = ArrayList<ContentProviderOperation>()

            // Insert raw contact
            ops.add(
                ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null as String?)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null as String?)
                    .build()
            )

            // Insert display name
            ops.add(
                ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                    .withValue(
                        ContactsContract.Data.MIMETYPE,
                        ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE
                    )
                    .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, displayName)
                    .build()
            )

            // Insert phone numbers
            for (phone in phoneNumbers) {
                ops.add(
                    ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                        .withValue(
                            ContactsContract.Data.MIMETYPE,
                            ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE
                        )
                        .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, phone["number"])
                        .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE)
                        .build()
                )
            }

            // Insert emails
            for (email in emails) {
                ops.add(
                    ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                        .withValue(
                            ContactsContract.Data.MIMETYPE,
                            ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE
                        )
                        .withValue(ContactsContract.CommonDataKinds.Email.ADDRESS, email["email"])
                        .withValue(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_WORK)
                        .build()
                )
            }

            val results = context.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
            val contactId = results[0].uri?.lastPathSegment

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "contactId" to contactId,
                    "created" to true
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "ContactCreateFailed",
                    "message" to (e.message ?: "Failed to create contact")
                )
            )
        }
    }

    /**
     * Update contact
     */
    fun updateContact(contactId: String, body: Map<String, Any>): Map<String, Any> {
        return try {
            val displayName = body["displayName"] as? String

            if (displayName != null) {
                val ops = ArrayList<ContentProviderOperation>()

                ops.add(
                    ContentProviderOperation.newUpdate(ContactsContract.Data.CONTENT_URI)
                        .withSelection(
                            "${ContactsContract.Data.CONTACT_ID} = ? AND ${ContactsContract.Data.MIMETYPE} = ?",
                            arrayOf(contactId, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                        )
                        .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, displayName)
                        .build()
                )

                context.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
            }

            mapOf(
                "status" to "success",
                "data" to mapOf("updated" to true)
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "ContactUpdateFailed",
                    "message" to (e.message ?: "Failed to update contact")
                )
            )
        }
    }

    /**
     * Delete contact
     */
    fun deleteContact(contactId: String): Map<String, Any> {
        return try {
            val uri = ContactsContract.RawContacts.CONTENT_URI
            val selection = "${ContactsContract.RawContacts.CONTACT_ID} = ?"
            val selectionArgs = arrayOf(contactId)

            val deleted = context.contentResolver.delete(uri, selection, selectionArgs)

            mapOf(
                "status" to "success",
                "data" to mapOf("deleted" to (deleted > 0))
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "ContactDeleteFailed",
                    "message" to (e.message ?: "Failed to delete contact")
                )
            )
        }
    }

    /**
     * Get phone numbers for contact
     */
    private fun getPhoneNumbers(contactId: String): List<Map<String, String>> {
        val phoneNumbers = mutableListOf<Map<String, String>>()

        try {
            val cursor = context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                null,
                "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
                arrayOf(contactId),
                null
            )

            cursor?.use {
                while (it.moveToNext()) {
                    val number = it.getString(it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER))
                    val type = it.getInt(it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.TYPE))

                    phoneNumbers.add(
                        mapOf(
                            "number" to number,
                            "type" to getPhoneType(type)
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return phoneNumbers
    }

    /**
     * Get emails for contact
     */
    private fun getEmails(contactId: String): List<Map<String, String>> {
        val emails = mutableListOf<Map<String, String>>()

        try {
            val cursor = context.contentResolver.query(
                ContactsContract.CommonDataKinds.Email.CONTENT_URI,
                null,
                "${ContactsContract.CommonDataKinds.Email.CONTACT_ID} = ?",
                arrayOf(contactId),
                null
            )

            cursor?.use {
                while (it.moveToNext()) {
                    val email = it.getString(it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.ADDRESS))
                    val type = it.getInt(it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.TYPE))

                    emails.add(
                        mapOf(
                            "email" to email,
                            "type" to getEmailType(type)
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return emails
    }

    private fun getPhoneType(type: Int): String = when (type) {
        ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE -> "mobile"
        ContactsContract.CommonDataKinds.Phone.TYPE_HOME -> "home"
        ContactsContract.CommonDataKinds.Phone.TYPE_WORK -> "work"
        else -> "other"
    }

    private fun getEmailType(type: Int): String = when (type) {
        ContactsContract.CommonDataKinds.Email.TYPE_HOME -> "home"
        ContactsContract.CommonDataKinds.Email.TYPE_WORK -> "work"
        else -> "other"
    }
}
