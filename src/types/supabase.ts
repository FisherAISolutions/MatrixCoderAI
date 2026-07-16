export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
          memory_stage: 'context' | 'sql' | 'storage';
          token_count: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
          memory_stage?: 'context' | 'sql' | 'storage';
          token_count?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
          memory_stage?: 'context' | 'sql' | 'storage';
          token_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: 'user' | 'assistant' | 'system';
          agent: 'planning' | 'coding' | 'reviewing' | 'orchestrator' | null;
          content: string;
          is_streaming: boolean;
          token_count: number | null;
          files: string[];
          thinking_steps: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: 'user' | 'assistant' | 'system';
          agent?: 'planning' | 'coding' | 'reviewing' | 'orchestrator' | null;
          content: string;
          is_streaming?: boolean;
          token_count?: number | null;
          files?: string[];
          thinking_steps?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: 'user' | 'assistant' | 'system';
          agent?: 'planning' | 'coding' | 'reviewing' | 'orchestrator' | null;
          content?: string;
          is_streaming?: boolean;
          token_count?: number | null;
          files?: string[];
          thinking_steps?: string[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };
      files: {
        Row: {
          id: string;
          session_id: string;
          file_path: string;
          file_name: string;
          parent_path: string | null;
          content: string | null;
          language: string;
          size: number | null;
          is_new: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          file_path: string;
          file_name: string;
          parent_path?: string | null;
          content?: string | null;
          language?: string;
          size?: number | null;
          is_new?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          file_path?: string;
          file_name?: string;
          parent_path?: string | null;
          content?: string | null;
          language?: string;
          size?: number | null;
          is_new?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'files_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };
      build_suite_saved_builds: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          favorite: boolean;
          selection: Json;
          advisor_recommendations: Json;
          final_prompt: string;
          metadata_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          favorite?: boolean;
          selection: Json;
          advisor_recommendations?: Json;
          final_prompt: string;
          metadata_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          favorite?: boolean;
          selection?: Json;
          advisor_recommendations?: Json;
          final_prompt?: string;
          metadata_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'build_suite_saved_builds_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      matrix_projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          payload: Json;
          created_at: string;
          updated_at: string;
          workspace_id: string | null;
          favorite: boolean;
          save_version: number;
          last_opened_at: string | null;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          description?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
          workspace_id?: string | null;
          favorite?: boolean;
          save_version?: number;
          last_opened_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
          workspace_id?: string | null;
          favorite?: boolean;
          save_version?: number;
          last_opened_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'matrix_projects_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      style_profiles: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          app_name: string;
          feedback: string;
          style_brief: Json;
          prompt_block: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          app_name?: string;
          feedback?: string;
          style_brief: Json;
          prompt_block: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          app_name?: string;
          feedback?: string;
          style_brief?: Json;
          prompt_block?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'style_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
