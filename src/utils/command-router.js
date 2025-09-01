/**
 * Command Router for Bot WhatsApp
 * Modular command system for better performance and maintainability
 */

const fs = require('fs');
const path = require('path');

class CommandRouter {
    constructor() {
        this.commands = new Map();
        this.categories = new Map();
        this.loadCommands();
    }

    /**
     * Load all commands from the commands directory
     */
    loadCommands() {
        const commandsDir = path.join(__dirname, '../commands');
        
        if (!fs.existsSync(commandsDir)) {
            console.log('Commands directory not found, creating...');
            fs.mkdirSync(commandsDir, { recursive: true });
            return;
        }

        const categories = fs.readdirSync(commandsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const category of categories) {
            this.loadCategoryCommands(category);
        }

        console.log(📚 Loaded  commands from  categories);
    }

    /**
     * Load commands from a specific category
     */
    loadCategoryCommands(category) {
        const categoryPath = path.join(__dirname, '../commands', category);
        const files = fs.readdirSync(categoryPath)
            .filter(file => file.endsWith('.js'));

        for (const file of files) {
            try {
                const commandPath = path.join(categoryPath, file);
                delete require.cache[require.resolve(commandPath)];
                const commandModule = require(commandPath);
                
                if (commandModule.name && commandModule.execute) {
                    // Support for multiple command names/aliases
                    const names = Array.isArray(commandModule.name) ? commandModule.name : [commandModule.name];
                    
                    for (const name of names) {
                        this.commands.set(name.toLowerCase(), {
                            ...commandModule,
                            category,
                            filename: file
                        });
                    }

                    // Track category
                    if (!this.categories.has(category)) {
                        this.categories.set(category, []);
                    }
                    this.categories.get(category).push(commandModule);
                }
            } catch (error) {
                console.error(❌ Error loading command :, error.message);
            }
        }
    }

    /**
     * Execute a command
     */
    async execute(commandName, context) {
        const command = this.commands.get(commandName.toLowerCase());
        
        if (!command) {
            return false; // Command not found
        }

        try {
            // Check permissions
            if (command.ownerOnly && !context.isOwner) {
                await context.reply('❌ Command ini hanya untuk owner!');
                return true;
            }

            if (command.adminOnly && !context.isGroupAdmins && !context.isOwner) {
                await context.reply('❌ Command ini hanya untuk admin grup!');
                return true;
            }

            if (command.groupOnly && !context.isGroup) {
                await context.reply('❌ Command ini hanya bisa digunakan di grup!');
                return true;
            }

            if (command.privateOnly && context.isGroup) {
                await context.reply('❌ Command ini hanya bisa digunakan di chat pribadi!');
                return true;
            }

            // Execute command
            await command.execute(context);
            return true;
        } catch (error) {
            console.error(❌ Error executing command :, error);
            await context.reply(❌ Terjadi kesalahan saat menjalankan command: );
            return true;
        }
    }

    /**
     * Get command info
     */
    getCommand(commandName) {
        return this.commands.get(commandName.toLowerCase());
    }

    /**
     * Get all commands in a category
     */
    getCommandsByCategory(category) {
        return this.categories.get(category) || [];
    }

    /**
     * Get all categories
     */
    getCategories() {
        return Array.from(this.categories.keys());
    }

    /**
     * Get all commands
     */
    getAllCommands() {
        return Array.from(this.commands.values());
    }

    /**
     * Reload commands (for development)
     */
    reload() {
        this.commands.clear();
        this.categories.clear();
        this.loadCommands();
    }
}

module.exports = CommandRouter;
