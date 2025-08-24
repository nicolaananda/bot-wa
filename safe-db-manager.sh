#!/bin/bash

# Safe Database Manager - WhatsApp Bot
# Script untuk mengelola database dengan aman tanpa kehilangan data

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_FILE="database.json"
BACKUP_DIR="database_backups"
SERVICES=("bot-wa" "dashboard-api")

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Function to check if PM2 is running
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed or not in PATH"
        exit 1
    fi
}

# Function to check if database file exists
check_database() {
    if [ ! -f "$DB_FILE" ]; then
        print_error "Database file $DB_FILE not found!"
        exit 1
    fi
}

# Function to create backup directory
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        print_status "Created backup directory: $BACKUP_DIR"
    fi
}

# Function to stop all services
stop_services() {
    print_status "Stopping all services..."
    
    for service in "${SERVICES[@]}"; do
        if pm2 list | grep -q "$service"; then
            print_status "Stopping $service..."
            pm2 stop "$service" || print_warning "Failed to stop $service"
        else
            print_warning "Service $service not found in PM2"
        fi
    done
    
    # Wait a bit for services to stop
    sleep 3
    print_status "All services stopped"
}

# Function to start all services
start_services() {
    print_status "Starting all services..."
    
    for service in "${SERVICES[@]}"; do
        if pm2 list | grep -q "$service"; then
            print_status "Starting $service..."
            pm2 start "$service" || print_warning "Failed to start $service"
        else
            print_warning "Service $service not found in PM2"
        fi
    done
    
    print_status "All services started"
}

# Function to backup database
backup_database() {
    create_backup_dir
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$BACKUP_DIR/database_backup_$timestamp.json"
    
    print_status "Creating backup: $backup_file"
    
    if cp "$DB_FILE" "$backup_file"; then
        print_status "Backup created successfully: $backup_file"
        
        # Keep only last 10 backups
        local backup_count=$(ls -1 "$BACKUP_DIR"/database_backup_*.json 2>/dev/null | wc -l)
        if [ "$backup_count" -gt 10 ]; then
            print_warning "Removing old backups (keeping last 10)..."
            ls -t "$BACKUP_DIR"/database_backup_*.json | tail -n +11 | xargs rm -f
        fi
    else
        print_error "Failed to create backup!"
        exit 1
    fi
}

# Function to restore database from backup
restore_database() {
    if [ -z "$1" ]; then
        print_error "Please specify backup file to restore"
        echo "Usage: $0 restore <backup_file>"
        exit 1
    fi
    
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    print_warning "This will overwrite current database!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Restoring database from: $backup_file"
        
        if cp "$backup_file" "$DB_FILE"; then
            print_status "Database restored successfully"
        else
            print_error "Failed to restore database!"
            exit 1
        fi
    else
        print_status "Restore cancelled"
    fi
}

# Function to list available backups
list_backups() {
    create_backup_dir
    
    local backup_files=$(ls -1 "$BACKUP_DIR"/database_backup_*.json 2>/dev/null | sort -r)
    
    if [ -z "$backup_files" ]; then
        print_warning "No backups found"
        return
    fi
    
    print_status "Available backups:"
    echo "$backup_files" | while read -r backup; do
        local size=$(du -h "$backup" | cut -f1)
        local date=$(stat -c %y "$backup" | cut -d' ' -f1,2)
        echo "  $backup ($size, $date)"
    done
}

# Function to edit database safely
edit_database() {
    print_status "Opening database for editing..."
    
    # Check if editor is available
    local editor=""
    if command -v nano &> /dev/null; then
        editor="nano"
    elif command -v vim &> /dev/null; then
        editor="vim"
    elif command -v vi &> /dev/null; then
        editor="vi"
    else
        print_error "No text editor found (nano, vim, or vi)"
        exit 1
    fi
    
    print_status "Using editor: $editor"
    print_warning "Make sure to save changes before exiting!"
    
    # Edit database
    "$editor" "$DB_FILE"
    
    print_status "Database editing completed"
}

# Function to validate database JSON
validate_database() {
    print_status "Validating database JSON..."
    
    if python3 -m json.tool "$DB_FILE" > /dev/null 2>&1; then
        print_status "Database JSON is valid"
    else
        print_error "Database JSON is invalid!"
        print_warning "You may need to restore from backup"
        return 1
    fi
}

# Function to show database info
show_database_info() {
    print_status "Database information:"
    
    if [ -f "$DB_FILE" ]; then
        local size=$(du -h "$DB_FILE" | cut -f1)
        local lines=$(wc -l < "$DB_FILE")
        local last_modified=$(stat -c %y "$DB_FILE" | cut -d' ' -f1,2)
        
        echo "  File: $DB_FILE"
        echo "  Size: $size"
        echo "  Lines: $lines"
        echo "  Last modified: $last_modified"
        
        # Count users and transactions if possible
        if command -v jq &> /dev/null; then
            local user_count=$(jq '.users | length' "$DB_FILE" 2>/dev/null || echo "N/A")
            local trans_count=$(jq '.transaksi | length' "$DB_FILE" 2>/dev/null || echo "N/A")
            echo "  Users: $user_count"
            echo "  Transactions: $trans_count"
        fi
    else
        print_error "Database file not found!"
    fi
}

# Function to show help
show_help() {
    cat << EOF
🔧 Safe Database Manager - WhatsApp Bot

Usage: $0 [command] [options]

Commands:
  backup                    - Create database backup
  restore <backup_file>    - Restore database from backup
  list-backups             - List available backups
  edit                     - Edit database safely (stops services first)
  validate                 - Validate database JSON format
  info                     - Show database information
  help                     - Show this help

Safe Edit Process:
  1. Stop all services (bot-wa, dashboard-api)
  2. Create backup
  3. Open database for editing
  4. Validate JSON format
  5. Start all services

Examples:
  $0 backup                    # Create backup
  $0 edit                     # Edit database safely
  $0 restore backup_file.json # Restore from backup
  $0 list-backups             # List available backups
  $0 validate                 # Check JSON validity
  $0 info                     # Show database info

⚠️  IMPORTANT: Always backup before editing!
EOF
}

# Main execution
main() {
    print_header "Safe Database Manager - WhatsApp Bot"
    
    # Check prerequisites
    check_pm2
    check_database
    
    local command="$1"
    
    case "$command" in
        "backup")
            backup_database
            ;;
        "restore")
            restore_database "$2"
            ;;
        "list-backups")
            list_backups
            ;;
        "edit")
            stop_services
            backup_database
            edit_database
            validate_database
            start_services
            print_status "Database editing completed successfully!"
            ;;
        "validate")
            validate_database
            ;;
        "info")
            show_database_info
            ;;
        "help"|"")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 