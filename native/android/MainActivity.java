package com.kaosstudios.worldchaos;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Tam ekran oyun modu:
 *  - Durum çubuğu ve gezinme tuşları gizli (kenardan kaydırınca geçici görünür)
 *  - Çentik (notch) alanına kadar çizim
 *  - Telefonun yazı boyutu ayarı oyunu büyütmesin (textZoom = 100)
 *  - Oynarken ekran kararmasın
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        getWindow().getDecorView().setBackgroundColor(0xFF07070C);
        hideSystemBars();
        if (getBridge() != null) {
            WebView wv = getBridge().getWebView();
            if (wv != null) {
                wv.getSettings().setTextZoom(100);
                wv.setBackgroundColor(0xFF07070C);
            }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
