diff --git a/chrome/install_static/user_data_dir.cc b/chrome/install_static/user_data_dir.cc
index 6b231841bf68c..1e1c62181db2b 100644
--- a/chrome/install_static/user_data_dir.cc
+++ b/chrome/install_static/user_data_dir.cc
@@ -10,6 +10,7 @@
 #include <stdlib.h>
 
 #include <optional>
+#include <string>
 
 #include "chrome/chrome_elf/nt_registry/nt_registry.h"
 #include "chrome/install_static/install_details.h"
@@ -82,6 +83,23 @@ bool GetDefaultUserDataDirectory(const InstallConstants& mode,
   // (https://msdn.microsoft.com/library/windows/desktop/dd378457.aspx).
   std::wstring user_data_dir = GetEnvironmentString(L"LOCALAPPDATA");
 
+  if (mode.base_app_name && std::wstring(mode.base_app_name) == L"PannamOS") {
+    std::wstring storage_root =
+        GetEnvironmentString(L"PANNAMOS_STORAGE_ROOT");
+    if (storage_root.empty()) {
+      storage_root = L"E:\\PannamOS";
+    }
+    while (!storage_root.empty() &&
+           (storage_root.back() == L'\\' || storage_root.back() == L'/')) {
+      storage_root.pop_back();
+    }
+    if (storage_root.empty()) {
+      return false;
+    }
+    *result = storage_root + L"\\BrowserProfile";
+    return true;
+  }
+
   if (user_data_dir.empty()) {
     // LOCALAPPDATA was not set; fallback to the temporary files path.
     DWORD size = ::GetTempPath(0, nullptr);
@@ -116,9 +134,24 @@ bool GetUserDataDirectoryImpl(const std::wstring& command_line,
                               std::wstring* invalid_supplied_directory) {
   std::wstring user_data_dir =
       GetCommandLineSwitchValue(command_line, kUserDataDirSwitch);
-
   GetUserDataDirFromRegistryPolicyIfSet(mode, &user_data_dir);
 
+  if (user_data_dir.empty()) {
+    user_data_dir =
+        GetCommandLineSwitchValue(command_line, L"pannamos-user-data-dir");
+  }
+  if (user_data_dir.empty()) {
+    std::wstring storage_root =
+        GetCommandLineSwitchValue(command_line, L"pannamos-storage-root");
+    while (!storage_root.empty() &&
+           (storage_root.back() == L'\\' || storage_root.back() == L'/')) {
+      storage_root.pop_back();
+    }
+    if (!storage_root.empty()) {
+      user_data_dir = storage_root + L"\\BrowserProfile";
+    }
+  }
+
   // Headless Chrome instances are expected to run in parallel with the headful
   // Chrome and other headless Chrome instances. In order to do so, headless
   // Chrome needs a dedicated user data directory for each headless instance.
