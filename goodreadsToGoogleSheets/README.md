# Goodreads to Google Sheets

Adds a button to Goodreads book pages that sends book information directly to Google Sheets via the Google Sheets API.

## Features

- **One-click book data export**: Send book information to your Google Sheets spreadsheet with a single click
- **Customizable field order**: Configure which fields to include and their order
- **Flexible formatting**: Choose different date and author name formats
- **Connection testing**: Test your Google Sheets API connection before saving settings
- **Persistent settings**: Your API credentials and preferences are saved locally

## Installation

### Method 1: Install from GitHub (Recommended)
1. Ensure you have Violentmonkey installed in your browser
2. Click on the "Install" link for the script you want to use
3. Violentmonkey should automatically detect the script and prompt you to install it
4. Click "Confirm installation"

### Method 2: Manual Installation
1. Click on the "View Script" link for the script you want to use
2. Copy the entire script content
3. Open Violentmonkey and click the "+" button to create a new script
4. Paste the script content and save

## Setup

### 1. Get Your Google Sheets API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Sheets API**
4. Create credentials &rarr; API Key
5. Add your domain to the API key restrictions (recommended for security)
6. Copy the API key

### 2. Get Your Spreadsheet ID

1. Open your Google Sheet in your browser
2. Look at the URL in the address bar
3. The Spreadsheet ID is the long string between `/d/` and `/edit`
   - Example: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjGMUUqptbfs74OvE2zmg5k/edit`
   - Spreadsheet ID: `1BxiMVs0XRA5nFMdKvBdBZjGMUUqptbfs74OvE2zmg5k`

### 3. Configure the Script

1. Navigate to any Goodreads book page
2. Click the "Settings" button (gear icon) in the new button bar
3. Enter your API Key, Spreadsheet ID, and Sheet Name
4. Click "Save Settings"
5. Optionally, click "Test Connection" to verify your configuration

## Usage

1. Navigate to any Goodreads book page
2. Click the "Send to Sheets" button (with Google logo)
3. The book information will be appended to your Google Sheet

## Fields Included

The script extracts and sends the following fields:
- Title
- Series Name
- Series Number
- Type (Novel, Novella, Short Story)
- Pages
- Personal Rating
- Goodreads Rating
- Author
- Narrator
- Published Date
- Times Read
- Plan
- Date Added
- Recommended By
- Goodreads Link

## Customization

You can customize the field order and formatting in the settings modal:
- **Field Separator**: Change the separator between fields (tab, comma, semicolon, pipe)
- **Author Format**: Choose between "Full Name" and "Last, First"
- **Publish Date Format**: Choose between "Month Day, Year", "Year Only", or "ISO (YYYY-MM-DD)"
- **Date Added Format**: Choose between UK, US, or ISO format
- **Field Order**: Drag and drop to reorder fields
- **Custom Empty Fields**: Add custom empty fields for your specific needs

## Security Notes

- Your API key is stored locally in your browser's userscript storage
- Never share your script with others if it contains your API key
- Consider adding domain restrictions to your API key for additional security
- The script uses the Google Sheets API v4 with the `append` method

## Troubleshooting

### "Google Sheets settings are not configured"
- Open the settings modal and enter your API credentials
- Make sure all three fields (API Key, Spreadsheet ID, Sheet Name) are filled

### "Connection failed"
- Verify your API key is correct
- Check that the Google Sheets API is enabled in your Google Cloud project
- Ensure your API key has the necessary permissions
- Try the "Test Connection" button to see the specific error message

### "Request timed out"
- Check your internet connection
- The Google Sheets API might be slow; try again

### Data not appearing in the sheet
- Verify the sheet name is correct (case-sensitive)
- Check that the sheet exists and is not protected
- Ensure the sheet has at least one row of data

## API Reference

The script uses the Google Sheets API v4 `append` method:
- Endpoint: `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{sheetName}:append`
- Method: POST
- Authentication: Bearer token (API key)
- Request body: JSON with headers and values arrays

## License

Same as the parent repository.
