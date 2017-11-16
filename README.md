# gitcheckout
This simple CLI tool will prompt you to conveniently choose a git branch, using keyboard arrows navigation, and check it out like a boss.

# Why??
Because we're lazy.
And sometimes you're so dedicated to writing long descriptive branch names, and so awesome you're working on 10 features at the same time. The least you can ask for is a CLI list with cool arrows navigation.

# Installation
`npm install -g gitcheckout-cli`

# Usage
In your git repo directory:

`gitcheckout`

If you want to choose a branch from the remote as well (not locally tracked yet):

`gitcheckout -o`

Then you'll be displayed with the available branches list. Simple pick one and hit Enter.
```
? Select branch to checkout: (Use arrow keys)
  develop
  hotfix/some-very-long-name-no-way-ill-remember
  feature/my-awesome-feature
  feature/gitcheckout-is-so-cool
  hotfix/fish-tacos-for-lunch
> master
```

Display help (yes, it has a '-h' arg)

`gitcheckout -h`


