// Static list of university faculty pages to scrape.
// Add or remove entries here to control what gets scraped.
// Each entry becomes one BullMQ job.

export const UNIVERSITY_URLS = [
  // University of Toronto
  {
    school: "University of Toronto",
    faculty: "Arts & Science",
    department: "Computer Science",
    url: "https://web.cs.toronto.edu/people/faculty-directory",
  },
  {
    school: "University of Toronto",
    faculty: "Arts & Science",
    department: "Mathematics",
    url: "https://www.math.toronto.edu/cms/people/",
  },
  {
    school: "University of Toronto",
    faculty: "Applied Science & Engineering",
    department: "Electrical & Computer Engineering",
    url: "https://www.ece.utoronto.ca/faculty/faculty-directory/",
  },
  {
    school: "University of Toronto",
    faculty: "Applied Science & Engineering",
    department: "Mechanical & Industrial Engineering",
    url: "https://www.mie.utoronto.ca/faculty-staff/core-faculty/",
  },

  // University of British Columbia
  {
    school: "University of British Columbia",
    faculty: "Science",
    department: "Computer Science",
    url: "https://www.cs.ubc.ca/people/faculty",
  },
  {
    school: "University of British Columbia",
    faculty: "Science",
    department: "Mathematics",
    url: "https://www.math.ubc.ca/people/faculty",
  },

  // McGill University
  {
    school: "McGill University",
    faculty: "Science",
    department: "Computer Science",
    url: "https://www.cs.mcgill.ca/people/faculty/",
  },
  {
    school: "McGill University",
    faculty: "Engineering",
    department: "Electrical & Computer Engineering",
    url: "https://www.mcgill.ca/ece/facultystaff/faculty",
  },

  // University of Waterloo
  {
    school: "University of Waterloo",
    faculty: "Mathematics",
    department: "Computer Science",
    url: "https://cs.uwaterloo.ca/about/our-people",
  },
  {
    school: "University of Waterloo",
    faculty: "Engineering",
    department: "Electrical & Computer Engineering",
    url: "https://uwaterloo.ca/electrical-computer-engineering/profiles",
  },

  // University of Alberta
  {
    school: "University of Alberta",
    faculty: "Science",
    department: "Computing Science",
    url: "https://www.ualberta.ca/en/computing-science/faculty-and-staff/faculty.html",
  },
];
