package app.cercle.perso;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.provider.CalendarContract;
import android.provider.CallLog;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.provider.Telephony;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Reads what the phone already knows about your exchanges: contacts, call log, SMS, calendar,
 * and WhatsApp notifications captured by {@link WaListener}. Only names, numbers, addresses and
 * dates leave this class; message bodies are never read.
 */
@CapacitorPlugin(
    name = "CercleNative",
    permissions = {
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "calls", strings = { Manifest.permission.READ_CALL_LOG }),
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }),
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR })
    }
)
public class CercleNativePlugin extends Plugin {

    private boolean granted(String alias) {
        return getPermissionState(alias) == PermissionState.GRANTED;
    }

    private static long longArg(PluginCall call, String name, long fallback) {
        Object v = call.getData().opt(name);
        return v instanceof Number ? ((Number) v).longValue() : fallback;
    }

    // ---------- contacts ----------

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (!granted("contacts")) {
            requestPermissionForAlias("contacts", call, "contactsPermission");
            return;
        }
        getBridge().execute(() -> readContacts(call));
    }

    @PermissionCallback
    private void contactsPermission(PluginCall call) {
        if (granted("contacts")) getBridge().execute(() -> readContacts(call));
        else call.reject("Accès aux contacts refusé", "permission_denied");
    }

    private void readContacts(PluginCall call) {
        ContentResolver cr = getContext().getContentResolver();
        LinkedHashMap<Long, JSObject> people = new LinkedHashMap<>();
        HashMap<Long, JSArray> phones = new HashMap<>();
        HashMap<Long, JSArray> emails = new HashMap<>();
        String[] proj = {
            ContactsContract.Data.CONTACT_ID,
            ContactsContract.Data.DISPLAY_NAME,
            ContactsContract.Data.MIMETYPE,
            ContactsContract.Data.DATA1,
            ContactsContract.Data.DATA2
        };
        String sel = ContactsContract.Data.MIMETYPE + " IN (?,?,?)";
        String[] args = {
            ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Event.CONTENT_ITEM_TYPE
        };
        try (Cursor c = cr.query(ContactsContract.Data.CONTENT_URI, proj, sel, args, ContactsContract.Data.DISPLAY_NAME + " ASC")) {
            if (c != null) {
                while (c.moveToNext()) {
                    long id = c.getLong(0);
                    String name = c.getString(1);
                    String mime = c.getString(2);
                    String value = c.getString(3);
                    int kind = c.isNull(4) ? 0 : c.getInt(4);
                    if (name == null || name.trim().isEmpty() || value == null || value.trim().isEmpty()) continue;
                    JSObject o = people.get(id);
                    if (o == null) {
                        o = new JSObject();
                        o.put("name", name.trim());
                        people.put(id, o);
                        phones.put(id, new JSArray());
                        emails.put(id, new JSArray());
                    }
                    if (ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE.equals(mime)) {
                        phones.get(id).put(value.trim());
                    } else if (ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE.equals(mime)) {
                        emails.get(id).put(value.trim());
                    } else if (kind == ContactsContract.CommonDataKinds.Event.TYPE_BIRTHDAY) {
                        o.put("bday", value.trim());
                    }
                }
            }
        } catch (Exception e) {
            call.reject("Lecture des contacts impossible : " + e.getMessage());
            return;
        }
        JSArray items = new JSArray();
        for (Map.Entry<Long, JSObject> e : people.entrySet()) {
            JSObject o = e.getValue();
            o.put("phones", phones.get(e.getKey()));
            o.put("emails", emails.get(e.getKey()));
            items.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("items", items);
        call.resolve(ret);
    }

    // ---------- call log ----------

    @PluginMethod
    public void getCallLog(PluginCall call) {
        if (!granted("calls")) {
            requestPermissionForAlias("calls", call, "callsPermission");
            return;
        }
        getBridge().execute(() -> readCalls(call));
    }

    @PermissionCallback
    private void callsPermission(PluginCall call) {
        if (granted("calls")) getBridge().execute(() -> readCalls(call));
        else call.reject("Accès au journal d'appels refusé", "permission_denied");
    }

    private void readCalls(PluginCall call) {
        long since = longArg(call, "since", 0L);
        String[] proj = { CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE, CallLog.Calls.CACHED_NAME };
        JSArray items = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI, proj, CallLog.Calls.DATE + " > ?", new String[] { String.valueOf(since) }, CallLog.Calls.DATE + " DESC")) {
            if (c != null) {
                while (c.moveToNext()) {
                    String number = c.getString(0);
                    if (number == null || number.isEmpty()) continue;
                    JSObject o = new JSObject();
                    o.put("number", number);
                    o.put("date", c.getLong(1));
                    o.put("duration", c.getLong(2));
                    o.put("type", c.getInt(3));
                    String name = c.getString(4);
                    o.put("name", name == null ? "" : name);
                    items.put(o);
                }
            }
        } catch (Exception e) {
            call.reject("Lecture du journal d'appels impossible : " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("items", items);
        call.resolve(ret);
    }

    // ---------- SMS (dates and numbers only) ----------

    @PluginMethod
    public void getSms(PluginCall call) {
        if (!granted("sms")) {
            requestPermissionForAlias("sms", call, "smsPermission");
            return;
        }
        getBridge().execute(() -> readSms(call));
    }

    @PermissionCallback
    private void smsPermission(PluginCall call) {
        if (granted("sms")) getBridge().execute(() -> readSms(call));
        else call.reject("Accès aux SMS refusé", "permission_denied");
    }

    private void readSms(PluginCall call) {
        long since = longArg(call, "since", 0L);
        String[] proj = { Telephony.Sms.ADDRESS, Telephony.Sms.DATE, Telephony.Sms.TYPE };
        JSArray items = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(
                Telephony.Sms.CONTENT_URI, proj, Telephony.Sms.DATE + " > ?", new String[] { String.valueOf(since) }, Telephony.Sms.DATE + " DESC")) {
            if (c != null) {
                while (c.moveToNext()) {
                    String address = c.getString(0);
                    if (address == null || address.isEmpty()) continue;
                    JSObject o = new JSObject();
                    o.put("address", address);
                    o.put("date", c.getLong(1));
                    o.put("type", c.getInt(2));
                    items.put(o);
                }
            }
        } catch (Exception e) {
            call.reject("Lecture des SMS impossible : " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("items", items);
        call.resolve(ret);
    }

    // ---------- calendar ----------

    @PluginMethod
    public void getCalendarEvents(PluginCall call) {
        if (!granted("calendar")) {
            requestPermissionForAlias("calendar", call, "calendarPermission");
            return;
        }
        getBridge().execute(() -> readCalendar(call));
    }

    @PermissionCallback
    private void calendarPermission(PluginCall call) {
        if (granted("calendar")) getBridge().execute(() -> readCalendar(call));
        else call.reject("Accès à l'agenda refusé", "permission_denied");
    }

    private void readCalendar(PluginCall call) {
        long now = System.currentTimeMillis();
        long from = longArg(call, "from", now - 365L * 86400000L);
        long to = longArg(call, "to", now + 90L * 86400000L);
        ContentResolver cr = getContext().getContentResolver();
        List<JSObject> events = new ArrayList<>();
        List<Long> eventIds = new ArrayList<>();
        Set<Long> wanted = new HashSet<>();
        String[] proj = { CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN };
        try (Cursor c = CalendarContract.Instances.query(cr, proj, from, to)) {
            if (c != null) {
                while (c.moveToNext()) {
                    long eventId = c.getLong(0);
                    JSObject o = new JSObject();
                    String title = c.getString(1);
                    o.put("title", title == null ? "" : title);
                    o.put("begin", c.getLong(2));
                    events.add(o);
                    eventIds.add(eventId);
                    wanted.add(eventId);
                }
            }
        } catch (Exception e) {
            call.reject("Lecture de l'agenda impossible : " + e.getMessage());
            return;
        }
        HashMap<Long, JSArray> attendees = new HashMap<>();
        String[] aproj = { CalendarContract.Attendees.EVENT_ID, CalendarContract.Attendees.ATTENDEE_EMAIL };
        try (Cursor c = cr.query(CalendarContract.Attendees.CONTENT_URI, aproj, null, null, null)) {
            if (c != null) {
                while (c.moveToNext()) {
                    long eventId = c.getLong(0);
                    String email = c.getString(1);
                    if (!wanted.contains(eventId) || email == null || email.isEmpty()) continue;
                    JSArray list = attendees.get(eventId);
                    if (list == null) {
                        list = new JSArray();
                        attendees.put(eventId, list);
                    }
                    list.put(email);
                }
            }
        } catch (Exception ignored) {
            // attendees are a bonus; titles are enough to match most events
        }
        JSArray items = new JSArray();
        for (int i = 0; i < events.size(); i++) {
            JSObject o = events.get(i);
            JSArray list = attendees.get(eventIds.get(i));
            o.put("attendees", list == null ? new JSArray() : list);
            items.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("items", items);
        call.resolve(ret);
    }

    // ---------- WhatsApp (notification access) ----------

    @PluginMethod
    public void isNotificationAccessEnabled(PluginCall call) {
        boolean on = NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
        JSObject ret = new JSObject();
        ret.put("enabled", on);
        call.resolve(ret);
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Réglage introuvable sur ce téléphone : " + e.getMessage());
        }
    }

    @PluginMethod
    public void getWhatsApp(PluginCall call) {
        long since = longArg(call, "since", 0L);
        JSObject ret = new JSObject();
        ret.put("items", WaStore.read(getContext(), since));
        call.resolve(ret);
    }
}
