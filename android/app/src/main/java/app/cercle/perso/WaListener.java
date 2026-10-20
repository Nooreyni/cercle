package app.cercle.perso;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Notes who wrote to you on WhatsApp, from the notification title only.
 * Group chats are skipped: they don't say much about one relationship.
 */
public class WaListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (!"com.whatsapp".equals(pkg) && !"com.whatsapp.w4b".equals(pkg)) return;
            Notification n = sbn.getNotification();
            if (n == null || n.extras == null) return;
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            if (ex.getBoolean("android.isGroupConversation", false)) return;
            CharSequence conversation = ex.getCharSequence("android.conversationTitle");
            if (conversation != null && conversation.length() > 0) return;
            CharSequence title = ex.getCharSequence("android.title");
            if (title == null) return;
            String name = title.toString().replaceAll("\\s*\\(\\d+[^)]*\\)\\s*$", "").trim();
            if (name.isEmpty() || name.equalsIgnoreCase("WhatsApp") || name.contains(": ") || name.contains(" @ ")) return;
            WaStore.add(getApplicationContext(), name, sbn.getPostTime());
        } catch (Exception ignored) {
            // never let a malformed notification crash the listener
        }
    }
}
