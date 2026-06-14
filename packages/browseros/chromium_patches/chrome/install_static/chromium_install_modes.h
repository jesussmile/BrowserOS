diff --git a/chrome/install_static/chromium_install_modes.h b/chrome/install_static/chromium_install_modes.h
index ee62888f89705..7ec72d302bc4b 100644
--- a/chrome/install_static/chromium_install_modes.h
+++ b/chrome/install_static/chromium_install_modes.h
@@ -21,7 +21,7 @@ inline constexpr wchar_t kCompanyPathName[] = L"";
 
 // The brand-specific product name to be included as a component of the install
 // and user data directory paths.
-inline constexpr wchar_t kProductPathName[] = L"Chromium";
+inline constexpr wchar_t kProductPathName[] = L"PannamOS";
 
 // The brand-specific safe browsing client name.
 inline constexpr char kSafeBrowsingName[] = "chromium";
@@ -44,48 +44,49 @@ inline constexpr auto kInstallModes = std::to_array<InstallConstants>({
             L"",  // Empty install_suffix for the primary install mode.
         .logo_suffix = L"",  // No logo suffix for the primary install mode.
         .app_guid =
-            L"",  // Empty app_guid since no integration with Google Update.
-        .base_app_name = L"Chromium",              // A distinct base_app_name.
-        .base_app_id = L"Chromium",                // A distinct base_app_id.
-        .browser_prog_id_prefix = L"ChromiumHTM",  // Browser ProgID prefix.
+            L"{150ED0EE-4CD9-410C-BFCC-8F2C4715B2CC}",  // PannamOS app GUID.
+        .base_app_name = L"PannamOS",              // A distinct base_app_name.
+        .base_app_id = L"PannamOS",                // A distinct base_app_id.
+        .browser_prog_id_prefix = L"PannamOSHTML",  // Browser ProgID prefix.
         .browser_prog_id_description =
-            L"Chromium HTML Document",  // Browser ProgID description.
-        .direct_launch_url_scheme = "chromium",
-        .pdf_prog_id_prefix = L"ChromiumPDF",  // PDF ProgID prefix.
+            L"PannamOS HTML Document",  // Browser ProgID description.
+        .direct_launch_url_scheme = "pannamos",
+        .pdf_prog_id_prefix = L"PannamOSPDF",  // PDF ProgID prefix.
         .pdf_prog_id_description =
-            L"Chromium PDF Document",  // PDF ProgID description.
+            L"PannamOS PDF Document",  // PDF ProgID description.
         .active_setup_guid =
-            L"{7D2B3E1D-D096-4594-9D8F-A6667F12E0AC}",  // Active Setup
+            L"{0D758066-C723-4FC5-B1C9-DEFD2A0CBF67}",  // Active Setup
                                                         // GUID.
         .legacy_command_execute_clsid =
-            L"{A2DF06F9-A21A-44A8-8A99-8B9C84F29160}",  // CommandExecuteImpl
+            L"{693E854A-5C8C-4F0D-ABFB-85FE3591C7DB}",  // CommandExecuteImpl
                                                         // CLSID.
-        .toast_activator_clsid = {0x635EFA6F,
-                                  0x08D6,
-                                  0x4EC9,
-                                  {0xBD, 0x14, 0x8A, 0x0F, 0xDE, 0x97, 0x51,
-                                   0x59}},  // Toast Activator CLSID.
-        .elevator_clsid = {0xD133B120,
-                           0x6DB4,
-                           0x4D6B,
-                           {0x8B, 0xFE, 0x83, 0xBF, 0x8C, 0xA1, 0xB1,
-                            0xB0}},  // Elevator CLSID.
-        .elevator_iid = {0xbb19a0e5,
-                         0xc6,
-                         0x4966,
-                         {0x94, 0xb2, 0x5a, 0xfe, 0xc6, 0xfe, 0xd9,
-                          0x3a}},  // IElevator IID and TypeLib
-        // {BB19A0E5-00C6-4966-94B2-5AFEC6FED93A}.
-        .tracing_service_clsid = {0x83f69367,
-                                  0x442d,
-                                  0x447f,
-                                  {0x8b, 0xcc, 0x0e, 0x3f, 0x97, 0xbe, 0x9c,
-                                   0xf2}},  // SystemTraceSession CLSID.
-        .tracing_service_iid = {0xa3fd580a,
-                                0xffd4,
-                                0x4075,
-                                {0x91, 0x74, 0x75, 0xd0, 0xb1, 0x99, 0xd3,
-                                 0xcb}},  // ISystemTraceSessionChromium IID and
+        // PannamOS: custom CLSIDs for Windows integration
+        .toast_activator_clsid = {0x8D2D7695,
+                                  0xFE3D,
+                                  0x4167,
+                                  {0x8E, 0xD4, 0xA6, 0x90, 0xA6, 0xED, 0x0F,
+                                   0x81}},  // Toast Activator CLSID.
+        .elevator_clsid = {0xACB5925A,
+                           0x68EF,
+                           0x480B,
+                           {0xBE, 0xCA, 0x46, 0xC6, 0x3C, 0x39, 0xED,
+                            0x7D}},  // Elevator CLSID.
+        .elevator_iid = {0x4F5C77E9,
+                         0xC017,
+                         0x4E25,
+                         {0x83, 0xF3, 0x02, 0x56, 0x49, 0x17, 0xA1,
+                          0x55}},  // IElevator IID and TypeLib
+        // {4F5C77E9-C017-4E25-83F3-02564917A155}.
+        .tracing_service_clsid = {0x47CA0581,
+                                  0x0EAB,
+                                  0x4979,
+                                  {0xB3, 0xBE, 0xF7, 0x56, 0x6B, 0x2B, 0x83,
+                                   0x79}},  // SystemTraceSession CLSID.
+        .tracing_service_iid = {0xFA2C667C,
+                                0x5612,
+                                0x466F,
+                                {0x9E, 0x91, 0xD2, 0x77, 0xB0, 0x07, 0xB5,
+                                 0xD9}},  // ISystemTraceSessionChromium IID and
                                           // TypeLib
         .default_channel_name =
             L"",  // Empty default channel name since no update integration.
