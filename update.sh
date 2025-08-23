#!/bin/bash

# Melakukan git pull
git pull

# Merestart service bot-wa
sudo systemctl restart bot-wa.service

# Memantau log secara realtime
journalctl -u bot-wa.service -f
