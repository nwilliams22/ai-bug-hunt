#!/bin/bash
# Refresh the nightly backup directory.

BACKUP_DIR=$1

rm -rf $BACKUP_DIR/*
cp -r /var/data/* $BACKUP_DIR/
echo "Backup complete: $(du -sh $BACKUP_DIR)"
