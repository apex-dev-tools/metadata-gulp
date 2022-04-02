FULL_NAME="Kevin Jones"
GITHUB_USER="nawforce"
REPO_NAME="apex-link-gulp"
sed -i.mybak "s/ryansonshine/$GITHUB_USER/g; s/typescript-npm-package-template\|my-package-name/$REPO_NAME/g; s/Ryan Sonshine/$FULL_NAME/g" package.json package-lock.json README.md
rm *.mybak
