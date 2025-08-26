#!/bin/bash

sudo systemctl stop bot-wa.service

# Melakukan git pull
git pull

# Merestart service bot-wa
sudo systemctl restart bot-wa.service
sudo systemctl restart apina.service

# Memantau log secara realtime
journalctl -u bot-wa.service -f
