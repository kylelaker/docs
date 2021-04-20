#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const walk = require('walk-sync')
const frontmatter = require('../../lib/read-frontmatter')
const getDocumentType = require('../../lib/get-document-type')
const languages = require('../../lib/languages')

const linkString = /{% [^}]*?link.*? (\/.*?) ?%}/m
const linksArray = new RegExp(linkString.source, 'gm')

// This script turns `{% link /<link> %} style content into children: [ -/<link> ] frontmatter arrays.
//
// It MUST be run after script/content-migrations/remove-map-topics.js.
//
// NOTE: The results won't work with the TOC handling currently in production, so the results must NOT
// be committed until the updated handling is in place.

const walkOpts = {
  includeBasePath: true,
  directories: false
}

const fullDirectoryPaths = Object.values(languages).map(langObj => path.join(process.cwd(), langObj.dir, 'content'))
const indexFiles = fullDirectoryPaths.map(fullDirectoryPath => walk(fullDirectoryPath, walkOpts)).flat()
  .filter(file => file.endsWith('index.md'))

const englishHomepageData = {
  children: '',
  externalProducts: ''
}

indexFiles
  .forEach(indexFile => {
    const relativePath = indexFile.replace(/^.+\/content\//, '')
    const documentType = getDocumentType(relativePath)

    const { data, content } = frontmatter(fs.readFileSync(indexFile, 'utf8'))

    // Save the English homepage frontmatter props...
    if (documentType === 'homepage' && !indexFile.includes('/translations/')) {
      englishHomepageData.children = data.children
      englishHomepageData.externalProducts = data.externalProducts
    }

    // ...and reuse them in the translated homepages, in case the translated files are out of date
    if (documentType === 'homepage' && indexFile.includes('/translations/')) {
      data.children = englishHomepageData.children
      data.externalProducts = englishHomepageData.externalProducts
    }

    const linkItems = content.match(linksArray) || []

    // Turn the `{% link /<link> %}` list into an array of /<link> items
    if (documentType === 'product' || documentType === 'mapTopic') {
      data.children = getLinks(linkItems)
    }

    if (documentType === 'category') {
      const childMapTopics = linkItems.filter(item => item.includes('topic_'))

      data.children = childMapTopics.length ? getLinks(childMapTopics) : getLinks(linkItems)
    }

    // Fix this one weird file
    if (relativePath === 'discussions/guides/index.md') {
      data.children = [
        '/best-practices-for-community-conversations-on-github',
        '/finding-discussions-across-multiple-repositories',
        '/granting-higher-permissions-to-top-contributors'
      ]
    }

    // Remove the Table of Contents section and leave any body text before it.
    const newContent = content
      .replace(/^#*? Table of contents[\s\S]*/im, '')
      .replace('<div hidden>', '')
      .replace(linksArray, '')
      .split('\n')
      .filter(line => /\S/.test(line))
      .join('\n')

    // Index files should no longer have body content, so we write an empty string
    fs.writeFileSync(indexFile, frontmatter.stringify(newContent, data, { lineWidth: 10000 }))
  })

function getLinks (linkItemArray) {
  // do a oneoff replacement while mapping
  return linkItemArray.map(item => item.match(linkString)[1].replace('/discussions-guides', '/guides'))
}
