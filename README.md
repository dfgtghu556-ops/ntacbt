# JEE Main Companion

You are an expert full-stack software engineer. Build a single self-contained HTML file (no backend, no frameworks, no external dependencies except PDF.js if absolutely necessary) that creates a professional JEE Main CBT (Computer Based Test) platform.

Objective

Create a website that feels almost identical to the official JEE Main (NTA) examination portal.

This website is for personal use only.

The uploaded PDFs will always follow the exact same format as my sample PDFs.

Do not support multiple PDF formats.

The website should automatically understand my PDF structure.

---

PDF Input

The website must have three upload buttons.

Upload Physics PDF

Upload Chemistry PDF

Upload Mathematics PDF

Each uploaded PDF always contains

25 Questions

MCQ and Integer Questions

Options

Answer Key

Detailed Solutions

The AI must automatically extract

Question

Images

Equations

Options

Correct Answer

Solution

without asking the user anything.

---

Test Creation

After uploading

Physics

Chemistry

Maths

automatically merge them into one test.

Total Questions = 75

Physics = 25

Chemistry = 25

Maths = 25

Automatically create the complete test.

No manual editing.

---

User Interface

Design should be inspired by the official NTA JEE Main CBT Portal.

Professional

Modern

Minimal

Blue and White

Rounded cards

Smooth animations

Responsive

Dark Mode

Mobile Friendly

Desktop Friendly

Tablet Friendly

---

Home Dashboard

Show

Upcoming Tests

Completed Tests

Average Marks

Highest Marks

Average Accuracy

Total Tests

Weak Subjects

Strong Subjects

Recent Performance

Quick Start Test Button

Upload PDFs Button

Planner

---

Planner

Create a planner page inspired by the uploaded Eklavya Test Planner.

Display

Upcoming Tests

Completed Tests

Calendar

Progress

Completion Percentage

Today's Test

---

Test Screen

Exactly like NTA.

Include

Question Number

Question Palette

Physics

Chemistry

Maths Tabs

Question Area

Images

Equations

Options

Clear Response

Save & Next

Previous

Mark for Review

Next

Submit Test

Fullscreen Button

Timer

Question Counter

Answered

Not Answered

Marked

Visited

Not Visited

Remaining Time

---

Timer

Countdown Timer

Auto Submit

Warnings

30 Minutes Left

10 Minutes Left

5 Minutes Left

1 Minute Left

---

Question Navigation

Jump to any question

Keyboard shortcuts optional

Color palette

Green

Red

Purple

White

Exactly like NTA

---

PDF Parsing

Automatically detect

Question Number

Question

Option A

Option B

Option C

Option D

Correct Answer

Solution

Images

Tables

Mathematical Equations

Maintain original formatting.

---

Result

Immediately after submission

Show

Total Marks

Correct

Wrong

Skipped

Negative Marks

Accuracy

Percentage

Time Taken

Subject Wise Marks

Overall Performance

---

AI Analysis

Generate detailed analysis.

Find

Weak Chapters

Strong Chapters

Weak Subjects

Strong Subjects

Most Incorrect Topics

Most Correct Topics

Most Time Consuming Questions

Easy Questions Missed

Hard Questions Solved

Conceptual Mistakes

Calculation Mistakes

Careless Mistakes

Guess Accuracy

Negative Marking Pattern

Average Time Per Question

Average Time Per Subject

Improvement Trend

Expected JEE Score

Expected Percentile

Expected Rank

Study Recommendations

Revision Suggestions

Priority Chapters

---

Question Review

After submission

Show every question

Question

My Answer

Correct Answer

Solution

Time Taken

Status

Correct

Wrong

Skipped

Bookmark Button

---

Practice Mode

Generate

Wrong Questions Test

Skipped Questions Test

Weak Chapter Test

Bookmarked Questions Test

Mixed Revision Test

---

Analytics Dashboard

Charts

Marks Trend

Accuracy Trend

Time Trend

Subject Wise Graph

Chapter Wise Graph

Weakness Heatmap

Performance Trend

Improvement Trend

---

Search

Search by

Question Number

Keyword

Chapter

Topic

Formula

Subject

---

Data Storage

Store everything using browser LocalStorage.

Remember

All Uploaded Tests

Results

Bookmarks

Wrong Questions

Statistics

Performance History

No backend required.

---

Code Requirements

Generate everything inside ONE HTML FILE.

Embed

HTML

CSS

JavaScript

No separate CSS file

No separate JS file

No frameworks

No React

No Angular

No Vue

Use only Vanilla HTML CSS JavaScript.

Keep the code modular and well commented.

Use reusable functions.

Avoid duplicate code.

---

Performance

Fast

Optimized

Smooth Animations

No unnecessary libraries.

---

Final Goal

When I upload my Physics, Chemistry and Maths PDFs in the fixed format, the website should automatically create a complete JEE Main CBT experience, conduct the exam, evaluate it using the answer keys and solutions in the PDFs, generate detailed analytics, store all results locally, and provide a professional NTA-style experience—all inside a single standalone HTML file with no backend and no manual configuration.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ntacbt.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6e87cfc9-38f2-4b70-88ba-1b1c475d73ef).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
