export interface University {
  code: string;
  name: string;
  domains: string[];
  card_aliases: string[][];
  source_url: string;
}

// Initial catalogue. Names and legacy card aliases are maintained separately.
export const universities: University[] = [
  { code: 'hcmut', name: 'Trường Đại học Bách khoa, Đại học Quốc gia Thành phố Hồ Chí Minh', domains: ['hcmut.edu.vn'],
    card_aliases: [['hcmut'], ['dai hoc bach khoa', 'hcm'], ['dai hoc bach khoa', 'ho chi minh'], ['ho chi minh city university of technology']], source_url: 'https://hcmut.edu.vn/' },
  { code: 'hcmus', name: 'Trường Đại học Khoa học tự nhiên, Đại học Quốc gia Thành phố Hồ Chí Minh', domains: ['hcmus.edu.vn'],
    card_aliases: [['hcmus'], ['dai hoc khoa hoc tu nhien', 'hcm'], ['dai hoc khoa hoc tu nhien', 'ho chi minh'], ['university of science', 'vnu hcm']], source_url: 'https://hcmus.edu.vn/' },
  { code: 'uit', name: 'Trường Đại học Công nghệ Thông tin, Đại học Quốc gia Thành phố Hồ Chí Minh', domains: ['uit.edu.vn'],
    card_aliases: [['uit'], ['dai hoc cong nghe thong tin'], ['university of information technology']], source_url: 'https://www.uit.edu.vn/' },
  { code: 'hust', name: 'Đại học Bách khoa Hà Nội', domains: ['hust.edu.vn'],
    card_aliases: [['hust'], ['dai hoc bach khoa ha noi'], ['hanoi university of science and technology']], source_url: 'https://hust.edu.vn/' },
  { code: 'hcmute', name: 'Trường Đại học Công nghệ Kỹ thuật Thành phố Hồ Chí Minh', domains: ['hcmute.edu.vn'],
    card_aliases: [['hcmute'], ['hcm ute'], ['dai hoc su pham ky thuat', 'hcm'], ['dai hoc su pham ky thuat', 'ho chi minh'], ['dai hoc cong nghe ky thuat', 'ho chi minh'], ['dai hoc cong nghe ky thuat', 'hcm'], ['ho chi minh city university of technology and education']], source_url: 'https://hcmute.edu.vn/' },
  { code: 'hcmussh', name: 'Trường Đại học Khoa học Xã hội và Nhân văn, Đại học Quốc gia Thành phố Hồ Chí Minh', domains: ['hcmussh.edu.vn'],
    card_aliases: [['hcmussh'], ['dai hoc khoa hoc xa hoi va nhan van', 'hcm'], ['dai hoc khoa hoc xa hoi va nhan van', 'ho chi minh'], ['university of social sciences and humanities', 'ho chi minh']], source_url: 'https://hcmussh.edu.vn/' },
  { code: 'ueh', name: 'Đại học Kinh tế Thành phố Hồ Chí Minh', domains: ['ueh.edu.vn'],
    card_aliases: [['ueh'], ['dai hoc kinh te thanh pho ho chi minh'], ['dai hoc kinh te tp hcm'], ['university of economics ho chi minh city']], source_url: 'https://ueh.edu.vn/' },
  { code: 'uef', name: 'Trường Đại học Kinh tế - Tài chính Thành phố Hồ Chí Minh', domains: ['uef.edu.vn'],
    card_aliases: [['uef'], ['dai hoc kinh te tai chinh'], ['ho chi minh city university of economics and finance']], source_url: 'https://www.uef.edu.vn/' },
  { code: 'uel', name: 'Trường Đại học Kinh tế - Luật, Đại học Quốc gia Thành phố Hồ Chí Minh', domains: ['uel.edu.vn'],
    card_aliases: [['uel'], ['dai hoc kinh te luat'], ['university of economics and law']], source_url: 'https://www.uel.edu.vn/' },
  // VNU mail is shared: email selects the candidate; the card must independently identify UET.
  { code: 'uet', name: 'Trường Đại học Công nghệ, Đại học Quốc gia Hà Nội', domains: ['vnu.edu.vn'],
    card_aliases: [['uet'], ['truong dai hoc cong nghe', 'dai hoc quoc gia ha noi'], ['university of engineering and technology', 'vnu']], source_url: 'https://uet.vnu.edu.vn/huong-dan-thu-tuc-nhap-hoc/' },
];

export function schoolCodeFromEmail(email: string): string {
  const domain = email.trim().toLowerCase().split('@')[1] || '';
  if (!/^(?:[a-z0-9-]+\.)+edu\.vn$/.test(domain)) return '';
  if (domain === 'vnu.edu.vn') return 'uet';
  return domain.slice(0, -'.edu.vn'.length).split('.').at(-1) || '';
}

export function universityFromEmail(email: string, catalogue: University[]) {
  const domain = email.trim().toLowerCase().split('@')[1] || '';
  return catalogue.find(school => school.domains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`)));
}
