/**
 * Handmatig bijgehouden totdat de Supabase CLI types genereert
 * (`supabase gen types typescript`). Houd dit bestand in sync met
 * de migraties in `supabase/migrations`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ImportStatus = "pending_mapping" | "completed" | "failed";
export type KvkEnrichmentStatus = "actief" | "inactief";
export type KvkMatchStatus = "high_confidence" | "review_required" | "no_reliable_match";
export type KvkMatchResolution = "confirmed" | "rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          company_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          company_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          company_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      imports: {
        Row: {
          id: string;
          user_id: string;
          original_filename: string;
          storage_path: string;
          status: ImportStatus;
          headers: Json;
          preview_rows: Json;
          row_count: number;
          column_mapping: Json | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          original_filename: string;
          storage_path: string;
          status?: ImportStatus;
          headers: Json;
          preview_rows: Json;
          row_count?: number;
          column_mapping?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          original_filename?: string;
          storage_path?: string;
          status?: ImportStatus;
          headers?: Json;
          preview_rows?: Json;
          row_count?: number;
          column_mapping?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      import_rows: {
        Row: {
          id: string;
          import_id: string;
          user_id: string;
          row_index: number;
          bedrijfsnaam: string | null;
          kvk_nummer: string | null;
          website: string | null;
          postcode: string | null;
          plaats: string | null;
          contactpersoon: string | null;
          functie: string | null;
          telefoon: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          import_id: string;
          user_id: string;
          row_index: number;
          bedrijfsnaam?: string | null;
          kvk_nummer?: string | null;
          website?: string | null;
          postcode?: string | null;
          plaats?: string | null;
          contactpersoon?: string | null;
          functie?: string | null;
          telefoon?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          import_id?: string;
          user_id?: string;
          row_index?: number;
          bedrijfsnaam?: string | null;
          kvk_nummer?: string | null;
          website?: string | null;
          postcode?: string | null;
          plaats?: string | null;
          contactpersoon?: string | null;
          functie?: string | null;
          telefoon?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      kvk_enrichments: {
        Row: {
          id: string;
          import_row_id: string;
          user_id: string;
          kvk_nummer: string;
          officiele_naam: string;
          handelsnamen: Json;
          rechtsvorm: string | null;
          status: KvkEnrichmentStatus;
          sbi_codes: Json;
          sbi_omschrijvingen: Json;
          aantal_werkzame_personen: number | null;
          vestigingsplaats: string | null;
          website: string | null;
          opgehaald_op: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          import_row_id: string;
          user_id: string;
          kvk_nummer: string;
          officiele_naam: string;
          handelsnamen?: Json;
          rechtsvorm?: string | null;
          status: KvkEnrichmentStatus;
          sbi_codes?: Json;
          sbi_omschrijvingen?: Json;
          aantal_werkzame_personen?: number | null;
          vestigingsplaats?: string | null;
          website?: string | null;
          opgehaald_op: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          import_row_id?: string;
          user_id?: string;
          kvk_nummer?: string;
          officiele_naam?: string;
          handelsnamen?: Json;
          rechtsvorm?: string | null;
          status?: KvkEnrichmentStatus;
          sbi_codes?: Json;
          sbi_omschrijvingen?: Json;
          aantal_werkzame_personen?: number | null;
          vestigingsplaats?: string | null;
          website?: string | null;
          opgehaald_op?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kvk_matches: {
        Row: {
          id: string;
          import_row_id: string;
          user_id: string;
          status: KvkMatchStatus;
          chosen_kvk_nummer: string | null;
          confidence: number | null;
          candidates: Json;
          gecontroleerd_op: string;
          resolution: KvkMatchResolution | null;
          resolved_kvk_nummer: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          import_row_id: string;
          user_id: string;
          status: KvkMatchStatus;
          chosen_kvk_nummer?: string | null;
          confidence?: number | null;
          candidates?: Json;
          gecontroleerd_op: string;
          resolution?: KvkMatchResolution | null;
          resolved_kvk_nummer?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          import_row_id?: string;
          user_id?: string;
          status?: KvkMatchStatus;
          chosen_kvk_nummer?: string | null;
          confidence?: number | null;
          candidates?: Json;
          gecontroleerd_op?: string;
          resolution?: KvkMatchResolution | null;
          resolved_kvk_nummer?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ImportRow = Database["public"]["Tables"]["imports"]["Row"];
export type ImportRecordRow =
  Database["public"]["Tables"]["import_rows"]["Row"];
export type KvkEnrichmentRow =
  Database["public"]["Tables"]["kvk_enrichments"]["Row"];
export type KvkMatchRow = Database["public"]["Tables"]["kvk_matches"]["Row"];
