export interface Task {
  id: string;
  text: string;
  tags: string[];
  flags: string[];
}

export const TASKS: Task[] = [
  // Physical / active
  { id: "t01", text: "Do 3 jumping jacks", tags: ["physical"], flags: [] },
  { id: "t02", text: "Do a cartwheel (or attempt one)", tags: ["physical"], flags: [] },
  { id: "t03", text: "Do a somersault on the floor", tags: ["physical"], flags: [] },
  { id: "t04", text: "Drop and do 5 push-ups", tags: ["physical"], flags: [] },
  { id: "t05", text: "Do 3 burpees as fast as you can", tags: ["physical"], flags: [] },
  { id: "t06", text: "Sprint to the nearest wall and back", tags: ["physical"], flags: [] },
  { id: "t07", text: "Do a wall sit for 5 seconds", tags: ["physical"], flags: [] },
  { id: "t08", text: "Bear crawl across the room", tags: ["physical"], flags: [] },
  { id: "t09", text: "Crab walk 5 steps", tags: ["physical"], flags: [] },
  { id: "t10", text: "Do a handstand against a wall (or try)", tags: ["physical"], flags: [] },
  { id: "t11", text: "Army crawl across the floor", tags: ["physical"], flags: [] },
  { id: "t12", text: "Skip around the room once", tags: ["physical"], flags: [] },
  { id: "t13", text: "Lunge walk 5 steps", tags: ["physical"], flags: [] },
  { id: "t14", text: "Hop on one foot for 5 seconds", tags: ["physical"], flags: [] },
  { id: "t15", text: "Do 5 high knees", tags: ["physical"], flags: [] },
  { id: "t16", text: "Do the worm on the floor (or try)", tags: ["physical"], flags: [] },
  { id: "t17", text: "Spin around 3 times without falling", tags: ["physical"], flags: [] },
  { id: "t18", text: "Do a squat and hold it for 3 seconds", tags: ["physical"], flags: [] },
  { id: "t19", text: "Jump as high as you can 3 times", tags: ["physical"], flags: [] },
  { id: "t20", text: "Touch your toes and hold for 3 seconds", tags: ["physical"], flags: [] },

  // Performance / acting
  { id: "t21", text: "Do your best superhero landing pose", tags: ["movement"], flags: [] },
  { id: "t22", text: "Do a dramatic slow-motion fall", tags: ["movement"], flags: [] },
  { id: "t23", text: "Moonwalk across the room", tags: ["movement"], flags: [] },
  { id: "t24", text: "Strike 3 different model poses", tags: ["movement"], flags: [] },
  { id: "t25", text: "Do the robot dance for 5 seconds", tags: ["movement"], flags: [] },
  { id: "t26", text: "Pretend you're swimming across the room", tags: ["movement"], flags: [] },
  { id: "t27", text: "Do your best breakdance move", tags: ["movement"], flags: [] },
  { id: "t28", text: "Walk like a zombie for 5 steps", tags: ["movement"], flags: [] },
  { id: "t29", text: "Shadow box for 5 seconds", tags: ["movement"], flags: [] },
  { id: "t30", text: "Do the sprinkler dance move", tags: ["movement"], flags: [] },

  // Audio / voice
  { id: "t31", text: "Scream like you just saw a spider", tags: ["audio"], flags: ["loud"] },
  { id: "t32", text: "Beatbox for 5 seconds", tags: ["audio"], flags: [] },
  { id: "t33", text: "Do your best opera singing voice", tags: ["audio"], flags: ["loud"] },
  { id: "t34", text: "Rap your name and what you ate today", tags: ["audio"], flags: [] },
  { id: "t35", text: "Do an impression of a crying baby", tags: ["audio"], flags: ["loud"] },
  { id: "t36", text: "Make every animal sound you can in 5 seconds", tags: ["audio"], flags: ["loud"] },
  { id: "t37", text: "Yell your favorite food as loud as you can", tags: ["audio"], flags: ["loud"] },
  { id: "t38", text: "Sing the chorus of any song right now", tags: ["audio"], flags: [] },
  { id: "t39", text: "Do a movie trailer voice for the room", tags: ["audio"], flags: [] },
  { id: "t40", text: "Whisper a secret then yell JUST KIDDING", tags: ["audio"], flags: ["loud"] },

  // Face / expression
  { id: "t41", text: "Make the ugliest face you possibly can", tags: ["face"], flags: [] },
  { id: "t42", text: "Look directly at someone and wink seductively", tags: ["face"], flags: [] },
  { id: "t43", text: "Do your best surprised Pikachu face", tags: ["face"], flags: [] },
  { id: "t44", text: "Pretend you just ate something disgusting", tags: ["face"], flags: [] },
  { id: "t45", text: "Make a face that would scare a child", tags: ["face"], flags: [] },

  // Silly / dares
  { id: "t46", text: "Pretend the floor is lava for 5 seconds", tags: ["physical"], flags: [] },
  { id: "t47", text: "Do the Macarena dance", tags: ["movement"], flags: [] },
  { id: "t48", text: "Gallop like a horse across the room", tags: ["physical"], flags: [] },
  { id: "t49", text: "Dab 5 times in a row", tags: ["movement"], flags: [] },
  { id: "t50", text: "Act out your morning routine in fast forward", tags: ["movement"], flags: [] },
  { id: "t51", text: "Pretend you're a sumo wrestler entering the ring", tags: ["physical"], flags: [] },
  { id: "t52", text: "Do a trust fall (catch yourself)", tags: ["physical"], flags: [] },
  { id: "t53", text: "Act like you're on a roller coaster", tags: ["movement", "audio"], flags: [] },
  { id: "t54", text: "Pretend to slam dunk an invisible basketball", tags: ["physical"], flags: [] },
  { id: "t55", text: "Do your best karate chop sequence", tags: ["physical"], flags: [] },

  // Extreme / challenge
  { id: "t56", text: "Do a plank for 5 seconds", tags: ["physical"], flags: [] },
  { id: "t57", text: "Do 10 mountain climbers", tags: ["physical"], flags: [] },
  { id: "t58", text: "Attempt a headstand (carefully)", tags: ["physical"], flags: [] },
  { id: "t59", text: "Do a full 360 jump spin", tags: ["physical"], flags: [] },
  { id: "t60", text: "Leapfrog over an invisible object", tags: ["physical"], flags: [] },
  { id: "t61", text: "Drop into the splits (or try)", tags: ["physical"], flags: [] },
  { id: "t62", text: "Do a duck walk for 5 steps", tags: ["physical"], flags: [] },
  { id: "t63", text: "Balance on one foot eyes closed for 3 seconds", tags: ["physical"], flags: [] },
  { id: "t64", text: "Do a backward roll on the floor", tags: ["physical"], flags: [] },
  { id: "t65", text: "Slide across the floor on your knees", tags: ["physical"], flags: [] },

  // Quick combos
  { id: "t66", text: "Clap behind your back 3 times", tags: ["physical"], flags: [] },
  { id: "t67", text: "Spin, dab, then freeze", tags: ["movement"], flags: [] },
  { id: "t68", text: "Jump, touch the floor, jump again", tags: ["physical"], flags: [] },
  { id: "t69", text: "Walk on your knees for 5 steps", tags: ["physical"], flags: [] },
  { id: "t70", text: "Do a push-up and clap mid-air (or try)", tags: ["physical"], flags: [] },
  { id: "t71", text: "Kick as high as you can 3 times", tags: ["physical"], flags: [] },
  { id: "t72", text: "Do a wall push-up 5 times fast", tags: ["physical"], flags: [] },
  { id: "t73", text: "Act like you're dodging lasers", tags: ["movement"], flags: [] },
  { id: "t74", text: "Pretend to climb an invisible rope", tags: ["physical"], flags: [] },
  { id: "t75", text: "Shuffle side to side like a basketball defender", tags: ["physical"], flags: [] },
];
