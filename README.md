# Enterprise HR | Intelligence Portal 🇰🇼

A robust, AI-powered Human Resources and Payroll management system tailored for the Kuwaiti market, featuring automated WPS (Wage Protection System) exports, General Ledger synchronization, and End-of-Service Benefit (EOSB) liability tracking.

## 🏗️ Project Architecture

This project follows a standard React + Vite + Supabase structure:

- **`src/`**: Primary application source code.
  - **`components/`**: Modular React components for Dashboard, Finance, Payroll, etc.
  - **`services/`**: Core business logic, including `dbService` for Supabase interaction and `financeUtils` for accounting logic.
  - **`hooks/`**: Custom React hooks for global state and theme management.
  - **`types/`**: Project-wide TypeScript interfaces and definitions.
  - **`styles/`**: Global CSS styling and design tokens.
  - **`translations/`**: Internationalization (i18n) resources for English and Arabic.
- **`scripts/`**: Maintenance, diagnostic, and automation tools.
  - **`maintenance/`**: Backfill and correction scripts.
  - **`migration/`**: Database schema updates and seed utilities.
  - **`diagnostics/`**: Audit and data integrity check scripts.
- **`migrations/`**: Versioned SQL migrations for the Supabase backend.
- **`docs/`**: Project documentation and business requirements.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: (Version 18+ recommended)
- **Supabase Account**: An active Supabase project with necessary tables.

### Installation

1.  **Clone the repository**.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory (refer to `.env.example`).
    ```env
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_ANON_KEY=your_anon_key
    VITE_GEMINI_API_KEY=your_gemini_key
    ```
4.  **Launch Database Migrations**:
    Apply SQL files from the `migrations/` folder within your Supabase SQL Editor.
5.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## 🛠️ Key Functionalities

- **Payroll Engine**: Accurate salary, allowance, and deduction calculations with Kuwaiti PIFSS support.
- **Finance Intelligence Hub**: Automatic Journal Entry (JV) generation with multi-dimensional mapping (Cost Centers, Natural Accounts).
- **EOSB Tracking**: Precise tracking of End-of-Service benefit liabilities for expatriate employees.
- **WPS Support**: Generates bank-ready XLS/CSV files for the Wage Protection System.
- **Bilingual Interface**: Seamless transition between English (LTR) and Arabic (RTL) layouts.

## ⚖️ License

Proprietary and Confidential.
