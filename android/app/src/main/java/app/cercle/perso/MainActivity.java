package app.cercle.perso;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CercleNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
