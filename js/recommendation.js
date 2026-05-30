/**
 * 온보딩 매칭 알고리즘 
 * 참조: onboarding-algorythm.md
 */

// 유저 입력 프로필을 기반으로 각 코스별 매칭도를 1~100 사이로 산출합니다.
function calculateMatchScore(course, userProfile) {
  let score = 0;
  
  // 1. 등산 경험 (Difficulty_Band) - Max 30pts
  let expScore = 0;
  const userExp = userProfile.experience;
  const diff = course.difficulty;
  
  if (userExp === '처음' || userExp === '입문') {
      if (diff === '초급') expScore = 30;
      else if (diff === '중급') expScore = 10;
      else expScore = 0;
  } else if (userExp === '중급') {
      if (diff === '중급') expScore = 30;
      else if (diff === '초급') expScore = 20;
      else expScore = 15;
  } else if (userExp === '고수') {
      if (diff === '고급') expScore = 30;
      else if (diff === '중급') expScore = 20;
      else expScore = 10;
  }
  score += expScore;

  // 2. 체력 (Score_Endurance) - Max 25pts
  let stamScore = 0;
  const endu = course.scoreEndurance || 0;
  const userStam = userProfile.stamina;
  
  if (userStam === '여유') {
      if (endu < 35) stamScore = 25;
      else if (endu < 50) stamScore = 15;
      else stamScore = 5;
  } else if (userStam === '보통') {
      if (endu >= 30 && endu <= 65) stamScore = 25;
      else stamScore = 15;
  } else if (userStam === '강행군') {
      if (endu > 60) stamScore = 25;
      else if (endu > 45) stamScore = 15;
      else stamScore = 5;
  }
  score += stamScore;

  // 3. 시간 (Distance 기준) - Max 25pts
  let timeScore = 0;
  const dist = course.totalDistance || 0;
  const userTime = userProfile.time;
  
  if (userTime === '3h') {
      if (dist < 8) timeScore = 25;
      else if (dist < 10) timeScore = 15;
      else timeScore = 5;
  } else if (userTime === '3-6h') {
      if (dist >= 7 && dist <= 16) timeScore = 25;
      else timeScore = 10;
  } else if (userTime === '6h+') {
      if (dist > 15) timeScore = 25;
      else if (dist > 10) timeScore = 15;
      else timeScore = 5;
  }
  score += timeScore;

  // 4. 목적 (Persona_Type / foodieIndex) - Max 20pts
  let purpScore = 0;
  const persona  = course.personaType || '';
  const userPurp = userProfile.purpose;

  if (userPurp === '풍경') {
      if (persona.includes('A') || persona.includes('C')) purpScore = 20;
      else purpScore = 10;
  } else if (userPurp === '운동') {
      if (persona.includes('B')) purpScore = 20;
      else purpScore = 10;
  } else if (userPurp === '맛집') {
      // 맛집 목적: foodieIndex 기반 점수 (POI_Master 기준 재계산된 값)
      const foodie = course.foodieIndex || 0;
      if      (foodie >= 70) purpScore = 20;
      else if (foodie >= 45) purpScore = 16;
      else if (foodie >= 25) purpScore = 11;
      else                   purpScore = 4;
  } else {
      purpScore = 15;
  }
  score += purpScore;

  // 5. 보너스 점수 (Region 등) - Max +15pts
  let bonus = 0;
  if (userProfile.region && course.region && course.region.includes(userProfile.region)) {
      bonus += 15;
  }

  return Math.min(score + bonus, 100);
}

/**
 * 전체 코스 리스트에서 유저 프로필과 가장 잘 맞는 Top N 코스 반환
 */
function getRecommendedCourses(courses, userProfile, limit = 3) {
  const scored = courses.map(course => {
      return {
          ...course,
          matchScore: calculateMatchScore(course, userProfile)
      };
  });
  
  // 매칭도(matchScore) 내림차순 정렬
  scored.sort((a, b) => b.matchScore - a.matchScore);
  
  // Top N개 반환
  return scored.slice(0, limit);
}

window.getRecommendedCourses = getRecommendedCourses;
