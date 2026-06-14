#!/usr/bin/env python3
"""Private product identity for PannamOS builds."""

from dataclasses import dataclass


@dataclass(frozen=True)
class WindowsInstallIdentity:
    product_path_name: str
    base_app_name: str
    base_app_id: str
    browser_prog_id_prefix: str
    pdf_prog_id_prefix: str
    direct_launch_url_scheme: str
    app_guid: str
    active_setup_guid: str
    legacy_command_execute_clsid: str
    toast_activator_clsid: str
    elevator_clsid: str
    elevator_iid: str
    tracing_service_clsid: str
    tracing_service_iid: str


@dataclass(frozen=True)
class ProductIdentity:
    product_name: str
    app_base_name: str
    company_name: str
    server_data_dir_name: str
    server_resources_dir_name: str
    server_appcast_url: str
    server_alpha_appcast_url: str
    server_updater_default_enabled: bool
    windows: WindowsInstallIdentity


PANNAMOS_PRODUCT_IDENTITY = ProductIdentity(
    product_name="PannamOS",
    app_base_name="PannamOS",
    company_name="PannamOS",
    server_data_dir_name=".pannamos",
    server_resources_dir_name="PannamOSServer",
    server_appcast_url="https://pannamos.invalid/appcast-server.xml",
    server_alpha_appcast_url="https://pannamos.invalid/appcast-server.alpha.xml",
    server_updater_default_enabled=False,
    windows=WindowsInstallIdentity(
        product_path_name="PannamOS",
        base_app_name="PannamOS",
        base_app_id="PannamOS",
        browser_prog_id_prefix="PannamOSHTML",
        pdf_prog_id_prefix="PannamOSPDF",
        direct_launch_url_scheme="pannamos",
        app_guid="{150ED0EE-4CD9-410C-BFCC-8F2C4715B2CC}",
        active_setup_guid="{0D758066-C723-4FC5-B1C9-DEFD2A0CBF67}",
        legacy_command_execute_clsid="{693E854A-5C8C-4F0D-ABFB-85FE3591C7DB}",
        toast_activator_clsid="{8D2D7695-FE3D-4167-8ED4-A690A6ED0F81}",
        elevator_clsid="{ACB5925A-68EF-480B-BECA-46C63C39ED7D}",
        elevator_iid="{4F5C77E9-C017-4E25-83F3-02564917A155}",
        tracing_service_clsid="{47CA0581-0EAB-4979-B3BE-F7566B2B8379}",
        tracing_service_iid="{FA2C667C-5612-466F-9E91-D277B007B5D9}",
    ),
)
