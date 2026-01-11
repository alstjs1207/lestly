/**
 * App Settings Types
 */

export interface SettingValue {
  value: number;
}

export interface Setting {
  setting_key: string;
  setting_value: SettingValue;
  created_at: string;
  updated_at: string;
}
