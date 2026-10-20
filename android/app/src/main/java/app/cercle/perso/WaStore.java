package app.cercle.perso;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** WhatsApp exchanges seen in notifications: who and when, nothing else. */
final class WaStore {
    private static final String PREFS = "cercle_wa";
    private static final String KEY = "events";
    private static final int MAX = 3000;
    // messages from the same person within this window count as one exchange
    private static final long BURST_MS = 10L * 60L * 1000L;

    private WaStore() {}

    static synchronized void add(Context ctx, String name, long ts) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr;
        try {
            arr = new JSONArray(sp.getString(KEY, "[]"));
        } catch (JSONException e) {
            arr = new JSONArray();
        }
        for (int i = arr.length() - 1; i >= 0 && i >= arr.length() - 60; i--) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && name.equals(o.optString("name")) && Math.abs(ts - o.optLong("ts")) < BURST_MS) return;
        }
        JSONObject o = new JSONObject();
        try {
            o.put("name", name);
            o.put("ts", ts);
        } catch (JSONException e) {
            return;
        }
        arr.put(o);
        if (arr.length() > MAX) {
            JSONArray trimmed = new JSONArray();
            for (int i = arr.length() - MAX; i < arr.length(); i++) trimmed.put(arr.opt(i));
            arr = trimmed;
        }
        sp.edit().putString(KEY, arr.toString()).apply();
    }

    static synchronized JSArray read(Context ctx, long since) {
        JSArray out = new JSArray();
        JSONArray arr;
        try {
            arr = new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
        } catch (JSONException e) {
            return out;
        }
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null || o.optLong("ts") <= since) continue;
            JSObject item = new JSObject();
            item.put("name", o.optString("name"));
            item.put("ts", o.optLong("ts"));
            out.put(item);
        }
        return out;
    }
}
