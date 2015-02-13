"use strict";
(function() {
  var http = require("http"),
    fs = require("fs"),
    _ = require("lodash-node"),
    pubs = JSON.parse(fs.readFileSync(__dirname + "/pubs.json")),
    pubs2 = JSON.parse(fs.readFileSync(__dirname + "/pubs2.json")),
    forms = JSON.parse(fs.readFileSync(__dirname + "/forms.json")),
    levels = {
      "Wing/Unit": "unit",
      "Base": "base",
      "Departmental": "dept",
      "Major Command": "majcom",
      "Field Operating Agency": "foa",
      "Direct Reporting Unit": "dru",
      "Air National Guard": "ang",
      "Special Forms Series": "spec",
      "Numbered AF": "naf",
      "Office of the Secretary of Defense": "secdef"
    },
    months = {
      "jan": "01",
      "feb": "02",
      "mar": "03",
      "apr": "04",
      "may": "05",
      "jun": "06",
      "jul": "07",
      "aug": "08",
      "sep": "09",
      "oct": "10",
      "nov": "11",
      "dec": "12"
    },
    a = 0,
    i = 0,
    pub, form, pubFile,
    pl = 0,
    fml = forms.length,
    ptmp, ftmp,
    regAttachmentSplit = /(?:^\s*|\n+?\s*)(?=Attachment\s\d+\n\n?\s*(?:.*\n)*\n?)/gm,
    regMetaGrab = /((?:[A-Z]{1}[a-z \,\.\-]+)+(?=\n))\n+\s*([A-Z\W\,\.\-]*?)(?=\n+\s*COMPLIANCE\sWITH\sTHIS\sPUBLICATION\sIS\sMANDATORY)/gm,
    regChapterSplit = /(?:^\s*|\n+?\s*)(?=(?:Chapter|C\d+\. CHAPTER) \d+\n\n\s*(?:.*\n)+?\n+?)/gm,
    regChapterGrab = /^\s*(?:Chapter|C\d+\. CHAPTER) \d+\n\n\s*(?:.*\n)+?\n+?(?=(?:^Section\s\d+\s?\—\s?(?:\S+\s)+|^C?(?:\d+\.)+\d+\.\s))/gm,
    regChapterSeparate = /^\s*(?:Chapter|C\d+\. CHAPTER) (\d+)\n\n\s*((?:.*\n)+?)\n+?(?=(?:^Section\s\d+[A-Z]*\s?\—\s?(?:\S+\s)+|^C?(?:\d+\.)+\d+\.\s))/gm,
    regSectionSplit = /(?:^\s*|\n+?\s*)(?=Section\s\d+[A-Z]*[\u2014\—](?:.*\n)+?\n?)/gm,
    regSectionGrab = /^\s*Section\s\d+[A-Z]*[\u2014\—](?:.*\n)+?\n?(?=C?(?:\d+\.)+\d+\.\s)/gm,
    regSectionSeparate = /^\s*Section\s(\d+[A-Z]*)[\u2014\—]((?:.*\n)+?)(?=\n?C?(?:\d+\.)+\d+\.\s)/gm,
    regSubSplit = /(?:^\s+|\n+\s*)(?=C?(?:\d+\.)+\d+\.\s\S)/gm,
    regSubSeparate = /^\s*(C?(?:\d+\.)+\d+\.?)+\.?\s(.*)$/gm,
    regSigBlock = /\n{4}\s*(?:[A-Z]+\s(?:[A-Z]+\.\s)*[A-Z]+\,(?:.*\n.*)+?)/gm,
    regDash = /([^\-\s\t\cI\v\0\f]-)(?:\s+|(?:\r\n)+|(?:\n\r)+|\r+|\n+|\t+)(\S)/gm,
    regQuotes = /[\u2015\u2016\u030E\u0348\u0022\u00AB\u00BB\u201C\u201D\u201E\u201F]/gmi,
    regInterSpacing = /(\w|\d|\S)(?:\s+)(\w|\d|\S)/gmi,
    regPageNumberA = /^\s?([A-Z0-9_\-\.]*)\s(\d{1,2}\s(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s\d{4})\s\s\s+\d+$/gm,
    regPageNumberB = /^\s?\d+\s\s\s+([A-Z0-9_\-\.]*)\s(\d{1,2}\s(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s\d{4})$/gm,
    regPageNumber = /^\s?(?:\d+  \s+)?([A-Z0-9_\-\. ]+) (\d{1,2} (?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) \d{4})(?:  \s+\d+)?$/gm,
    regLine = /(?:\r|\n)+\s*/gm,
    regPubName = /^BY ORDER OF (?:THE)? (?:PRESIDENT|COMMANDERS?|SECRETARY|CHIEF)?  [ ]+   ([A-Z0-9\-_\. ]+)\n(?:[A-Z0-9 ]+  [ ]+([A-Z0-9\-_\. ]+))?(?=[\s\S]+?COMPLIANCE WITH THIS PUBLICATION IS MANDATORY)/gm,
    regPubNameNormalize = /\b[A-Z]+ /g,
    regPubNumbers = / ?([^A-Z]+)$/m,
    regDate = /\d{1,2}\-[A-Za-z]{3}\-\d{4}/g,
    regEndSub = /\.[0-9]+$/m,
    counter = 0,
    allPubs = [],
    allForms = [],
    pubReq,
    opts = {
      hostname: "localhost",
      port: 9200,
      path: "/_bulk",
      method: "POST"
    },
    fileRead = function( raw, meta ) {
      var pub = meta.productNo;
      /*
       * Remove the page # header/footers and glue broken up numbers with dashes on
       * different lines back together again
       */
      var rawTidy = raw.replace(regQuotes, '"').replace(regDash, "$1$2")

      var pubName = meta.pubName;
      var isSup = (pubName !== pub);
      var releaseDate;
      try {
        releaseDate = regPageNumber.exec(rawTidy)[2].split(" ");
        releaseDate = releaseDate[2] + months[releaseDate[1].toLowerCase().slice(0,3)] + ((releaseDate[0].length<2)?"0"+releaseDate[0]:releaseDate[0]);
      }
      catch (err) {
        releaseDate = null;
      }


      rawTidy = rawTidy.replace(regPageNumber, "");
      /* Take the rawTidy content and transform into chapters:
       *  - remove pesky signature block at bottom - we don't need it
       *  - split into another array of all chapters and remove first result
       *    this first array element (result) is everything BEFORE the text
       *    ...then join back to a string for re-splitting
       *  - split at the attachments, then only take the first element (text)
       *  - FINALLY split into actual chapters.
       */
      var contentTidy = rawTidy.replace(regSigBlock, "\n");
      /* All the text, split up by chapters[o] */
      var fullContent = contentTidy.split(regChapterSplit);

      /* Just in case someone wants the table of contents (or stuff before it) */
      var beforeContent = fullContent.shift();

      /* Text including chapters and attachments, slimmed down pretty */
      var mainContent = fullContent.join("\n").split(regAttachmentSplit);

      /* Only chapters, broken up into an Array() */
      var chapters = mainContent.shift().split(regChapterSplit);

      var level = ( isSup ) ? "supplement" : levels[meta.level]||"other";

      if ( chapters.length < 2 ) {
        /*fs.appendFileSync(__dirname + "/badfilesA1.txt", name + "\n", {encoding: "utf8"});*/
        //process.exit(1);
        var badFile = true;
      }
      /* Last things remaining in mainContent are the attachments
       Here is the variable def but not sure when I'll implement.  Those things are ridiculous to parse.

       attachments = mainContent,
       */

      /* Pull out the publication type/category and title

       var meta = beforeContent.split(regMetaGrab);
       var title = (meta && meta[2]) ? meta[2].replace(/(\S)(?:\W+?)/gm, "$1 ").replace(regInterSpacing, "$1 $2") : "";
       var category = (meta && meta[1]) ? meta[1].replace(/([\S,\.\-_])(?:\W+)/gm, "$1 ").replace(regInterSpacing, "$1 $2") : "";

       */

      return {
        /*req: http.request(opts),*/
        pub: pub,
        title: meta.title,
        category: meta.category,
        isSup: isSup,
        chapters: chapters,
        pubName: meta.pubName,
        releaseDate: releaseDate,
        sec: 0,
        subs: [],
        parse: function() {
          var o = 0,
            p = 0,
            w = 0,
            chlength = chapters.length;

          if (badFile) {
            return this;
          }

          for (; o < chlength; ++o) {

            var chapterInfo = chapters[o].split(regChapterSeparate);
            if ( !chapterInfo || !chapterInfo[1] || !chapterInfo[2] ) {
              console.log("Chapter details wouldn't parse - formatting/RegEx mis-match.");
              return "";
            }
            var chapterNumber = chapterInfo[1],
              chapterTitle = chapterInfo[2].replace(regLine, " ").replace(/(\b) $/gm, "$1").replace(regInterSpacing, "$1 $2");

            this.subs.push(JSON.stringify({
              index: {
                _index: level,
                _type: "chapter",
                _id: meta.productNo + "._." + chapterNumber,
                _parent: meta.productNo
              }
            }) + "\n" + JSON.stringify({
              productNo: meta.productNo,
              pubName: meta.pubName,
              title: meta.title,
              series: meta.series,
              category: meta.category,
              level: level,
              type: meta.type,
              publishedDate: meta.publishedDate,
              releaseDate: releaseDate,
              gmpmDate: meta.gmpmDate,
              opr: meta.opr,
              issuingOrganization: meta.issuingOrganization,
              url: meta.url,
              number: chapterNumber,
              text: chapterTitle
            }) + "\n");

            var sections = chapters[o].replace(regChapterSeparate, "").split(regSectionSplit),
              subSections;

            if ( typeof sections === "undefined" || !sections || sections.length < 1 || (sections && sections[0] && sections[0].length == chapters[o].replace(regChapterGrab, "").length) ) {
              subSections = chapters[o].replace(regChapterGrab, "").split(regSubSplit);
              sslength = (subSections && subSections.length);

              for (; p < sslength; ++p) {
                var parts = subSections[p].replace(regLine, " ").split(regSubSeparate);

                if (!parts[1] || !parts[2]) {
                  return "";
                }

                var subNumber = parts[1].slice(0,-1),
                  subText = parts[2].replace(regInterSpacing, "$1 $2"),
                  /*parentNumber = _.initial(subNumber.split(".")).join(".");*/
                  parentNumber = subNumber.replace(regEndSub, "");


                this.subs.push(JSON.stringify({
                  index: {
                    _index: level,
                    _type: "chapter_content",
                    _id: meta.productNo + "._." + subNumber,
                    _parent: meta.productNo + "._." + chapterNumber
                  }
                }) + "\n" + JSON.stringify({
                  productNo: meta.productNo,
                  pubName: meta.pubName,
                  title: meta.title,
                  series: meta.series,
                  category: meta.category,
                  level: level,
                  type: meta.type,
                  publishedDate: meta.publishedDate,
                  releaseDate: releaseDate,
                  gmpmDate: meta.gmpmDate,
                  opr: meta.opr,
                  issuingOrganization: meta.issuingOrganization,
                  url: meta.url,
                  chapter: {
                    number: chapterNumber||null,
                    title: chapterTitle||null
                  },
                  parentNumber: parentNumber,
                  number: subNumber,
                  text: subText
                }) + "\n");

              } /* END forEach(subSection) - chapters[o] version */

            }
            else {
              this.sec = (sections && sections.length);
              for (; w < this.sec; ++w ) {
                var sectionInfo = sections[w].split(regSectionSeparate);

                if ( !sectionInfo[1] || !sectionInfo[2] ) {
                  console.log("sections[w] > splitup bad (title and number) inside chapters[o] " + chapterNumber);
                  return "";
                }
                var sectionNumber = sectionInfo[1],
                  sectionTitle = sectionInfo[2].replace(regLine, " ").replace(/(\b) $/gm, "$1").replace(regInterSpacing, "$1 $2");

                this.subs.push(JSON.stringify({
                  index: {
                    _index: level,
                    _type: "section",
                    _id: meta.productNo + "._." + sectionNumber,
                    _parent: meta.productNo + "._." + chapterNumber
                  }
                }) + "\n" + JSON.stringify({
                  productNo: meta.productNo,
                  pubName: meta.pubName,
                  title: meta.title,
                  series: meta.series,
                  category: meta.category,
                  level: level,
                  type: meta.type,
                  publishedDate: meta.publishedDate,
                  releaseDate: releaseDate,
                  gmpmDate: meta.gmpmDate,
                  opr: meta.opr,
                  issuingOrganization: meta.issuingOrganization,
                  url: meta.url,
                  chapter: {
                    number: chapterNumber||null,
                    title: chapterTitle||null
                  },
                  number: sectionNumber,
                  text: sectionTitle
                }) + "\n");

                var subSections = sections[w].replace(regSectionGrab, "").split(regSubSplit),
                    sslength = (subSections && subSections.length);

                for (; p < sslength; ++p ) {
                  var parts = subSections[p].replace(regLine, " ").split(regSubSeparate);

                  if (!parts[1] || !parts[2]) {
                    return "";
                  }

                  var subNumber = parts[1].slice(0,-1),
                    /*subNumArray = subNumber.split("."),*/
                    subText = parts[2].replace(regInterSpacing, "$1 $2"),
                  /*parentNumber = subNumArray.splice(subNumArray.length, 1).join(".");*/
                    parentNumber = subNumber.replace(regEndSub, "");

                  this.subs.push(JSON.stringify({
                    index: {
                      _index: level,
                      _type: "section_content",
                      _id: meta.productNo + "._." + subNumber,
                      _parent: meta.productNo + "._." + sectionNumber
                    }
                  }) + "\n" + JSON.stringify({
                    productNo: meta.productNo,
                    pubName: meta.pubName,
                    title: meta.title,
                    series: meta.series,
                    category: meta.category,
                    level: level,
                    type: meta.type,
                    publishedDate: meta.publishedDate,
                    releaseDate: releaseDate,
                    gmpmDate: meta.gmpmDate,
                    opr: meta.opr,
                    issuingOrganization: meta.issuingOrganization,
                    url: meta.url,
                    chapter: {
                      number: chapterNumber||null,
                      title: chapterTitle||null
                    },
                    section: {
                      number: sectionNumber,
                      title: sectionTitle
                    },
                    parentNumber: parentNumber,
                    number: subNumber,
                    text: subText
                  }) + "\n");

                } /* END forEach(subSection) */

              } /* END forEach(sections[w]) */

            } /* END IF */

          } /* END forEach(chapters[o]) */
          return this;
        }
      };
    };

  pubs = pubs.concat(pubs2);
  pl = pubs.length;

  for (; i < pl; ++i) {
    if ( !pubs[i].productNo ) continue;
    pubs[i].url = ( pubs[i].medium !== "Physical" ) ? "http://static.e-publishing.af.mil/production/1/" + pubs[i].issuingOrganization.replace(/(\/|\s)/g, "_").toLowerCase() + "/publication/" + pubs[i].productNo.toLowerCase() + "/" + pubs[i].productNo.toLowerCase() + ".pdf" : null;
    ptmp = ( regDate.test(pubs[i].publishedDate) ) ? pubs[i].publishedDate.split("-").reverse() : pubs[i].publishedDate.split("-");
    if ( ptmp && ptmp.length > 1 ) {
      ptmp[1] = months[ ptmp[1].toLowerCase() ];
      pubs[i].publishedDate = ptmp.join("");
    }
    else {
      pubs[i].publishedDate = null;
    }
    ptmp = null;
    if ( pubs[i].series ) {
      var sercat = pubs[i].series.split(" - ");
      pubs[i].series = parseInt(sercat[0], 10);
      pubs[i].category = sercat[1];
    }
    if ( pubs[i].type ) {
      var abbdes = pubs[i].type.split(" - ");
      delete pubs[i].type;
      pubs[i].type = {
        abbr: abbdes[0],
        desc: abbdes[1]
      };
    }
    else {
      pubs[i].type = null;
    }
    abbdes = null;
    if ( !pubs[i].gmpmDate ) {
      pubs[i].gmpmDate = null;
    }
    else {
      ptmp = ( regDate.test(pubs[i].gmpmDate) ) ? pubs[i].gmpmDate.split("-").reverse() : pubs[i].gmpmDate.split("-");
      if ( ptmp && ptmp.length > 1 ) {
        ptmp[1] = months[ ptmp[1].toLowerCase() ];
        pubs[i].gmpmDate = ptmp.join("");
      }
      else {
        pubs[i].gmpmDate = null;
      }
    }
    if ( pubs[i].pages ) pubs[i].pages = parseInt(pubs[i].pages, 10);
    delete pubs[i].managedBy;
    pubs[i].pubName = pubs[i].productNo.replace(/_.*/g, "");

    allPubs.push(JSON.stringify({
      index: {
        _index: ( pubs[i].pubName !== pubs[i].productNo ) ? "supplement" : levels[pubs[i].level]||"other",
        _type: "pub",
        _id: pubs[i].productNo
      }
    }) + "\n" + JSON.stringify(pubs[i]) + "\n");
  };

  for (; a < fml; ++a) {
    if ( !forms[a].productNo ) continue;
    forms[a].url = ( forms[a].medium !== "Physical" ) ? "http://static.e-publishing.af.mil/production/1/" + forms[a].issuingOrganization.replace(/(\/|\s)/g, "_").toLowerCase() + "/form/" + forms[a].productNo.toLowerCase() + "/" + forms[a].productNo.toLowerCase() + ".xfdl" : null;
    ftmp = ( regDate.test( forms[a].publishedDate ) ) ? forms[a].publishedDate.split("-").reverse() : forms[a].publishedDate.split("-");
    if ( ftmp && ftmp.length > 1 ) {
      ftmp[1] = months[ ftmp[1].toLowerCase() ];
      forms[a].publishedDate = ftmp.join("");
    }
    else {
      forms[a].publishedDate = null;
    }
    ftmp = null;
    if ( forms[a].series ) {
      var fsercat = forms[a].series.split(" - ");
      forms[a].series = parseInt(fsercat[0], 10);
      forms[a].category = fsercat[1];
    }
    if ( forms[a].pages ) forms[a].pages = parseInt(forms[a].pages, 10);
    delete forms[a].managedBy;
    allForms.push(JSON.stringify({
      index: {
        _index: levels[forms[a].level]||"other",
        _type: "form",
        _id: forms[a].productNo
      }
    }) + "\n" + JSON.stringify(forms[a]) + "\n");
  }
  var ab,
    req = http.request(opts, function(res) {
      res.on("data", function() {
        var subReq, text;
        ab = 0;
        for (; ab < pl; ++ab ) {
          if ( pubs[ab].productNo ) {
            try {
              pubFile = fs.readFileSync(__dirname + "/txt/" + pubs[ab].productNo.toLowerCase() + ".txt", {encoding: "utf8"});
              text = fileRead(pubFile, pubs[ab], pubs[ab].productNo.toLowerCase()).parse();
              console.log( text.pub + " ||| " + text.chapters.length + " chapters, " + text.sec + " sections, " + text.subs.length + " subs" );
            }
            catch ( error ) {
              console.error(error);
            }
            if (text) {
              subReq = http.request(opts);
              subReq.on("error", function(e) {
                console.error("problem with sub request: ", e);
              });
              subReq.end(text.subs.join(""));
              subReq = null;
            }
          }
        }
      })
    });
  req.on("error", function(e) {
    console.error("problem with main stupid request: ", e);
  });
  req.end(allPubs.join("") + allForms.join(""));
})();
