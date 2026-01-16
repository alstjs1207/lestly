-- Grant table permissions for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON super_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON test_send_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON in_app_notifications TO authenticated;

-- Grant INSERT permission for anon (for consult notifications)
GRANT INSERT ON notifications TO anon;

-- Grant sequence permissions for identity columns
GRANT USAGE ON SEQUENCE notifications_notification_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE notifications_notification_id_seq TO anon;
GRANT USAGE ON SEQUENCE super_templates_super_template_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE organization_templates_org_template_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE test_send_logs_log_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE in_app_notifications_in_app_notification_id_seq TO authenticated;

-- Grant permissions for service_role (for admin client and cron jobs)
GRANT ALL ON notifications TO service_role;
GRANT ALL ON super_templates TO service_role;
GRANT ALL ON organization_templates TO service_role;
GRANT ALL ON test_send_logs TO service_role;
GRANT ALL ON in_app_notifications TO service_role;
