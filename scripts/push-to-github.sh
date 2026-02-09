#!/bin/bash

# Push changes to GitHub
git add .
git commit -m "fix: reconcile tier and score consistency in entry decisions"
git push origin v0/jaspalbilkhu-2038-ab520cb6-3

echo "Changes pushed to GitHub successfully"
