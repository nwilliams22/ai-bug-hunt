#!/bin/bash
# Rebuild the search index. Only one rebuild may run at a time, so a run that
# finds the lock held reports that and stops.
#
#   reindex.sh /var/lib/search
set -e

LOCK=/tmp/reindex.lock
DATA=$1

trap 'rm -f $LOCK' EXIT

if [ -f $LOCK ]; then
  echo "reindex already running (pid $(cat $LOCK))"
  exit 0
fi

echo $$ > $LOCK

find $DATA -name '*.idx' -mtime +7 -delete
/usr/local/bin/indexer --data $DATA --out $DATA/index.new
mv $DATA/index.new $DATA/index

echo "reindex done at $(date +%H:%M)"
