-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 20, 2026 at 06:29 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `travel_planner`
--

-- --------------------------------------------------------

--
-- Table structure for table `admin_audit_log`
--

CREATE TABLE `admin_audit_log` (
  `id` int(11) NOT NULL,
  `actor_id` int(11) NOT NULL,
  `action` varchar(80) NOT NULL,
  `target_type` varchar(40) NOT NULL,
  `target_id` int(11) DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `admin_notification_log`
--

CREATE TABLE `admin_notification_log` (
  `id` int(11) NOT NULL,
  `actor_id` int(11) NOT NULL,
  `audience_type` varchar(30) NOT NULL,
  `target_user_id` int(11) DEFAULT NULL,
  `title` varchar(140) NOT NULL,
  `body` text NOT NULL,
  `result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`result`)),
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `admin_settings`
--

CREATE TABLE `admin_settings` (
  `setting_key` varchar(80) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `value_type` varchar(20) NOT NULL DEFAULT 'string',
  `description` varchar(255) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admin_settings`
--

INSERT INTO `admin_settings` (`setting_key`, `setting_value`, `value_type`, `description`, `updated_by`, `updated_at`) VALUES
('admin_broadcasts_enabled', 'true', 'boolean', 'Allow admins to send targeted push notifications.', NULL, '2026-05-19 23:37:40'),
('content_review_required', 'true', 'boolean', 'Keep newly created admin places in review by default.', NULL, '2026-05-19 23:37:40'),
('maintenance_mode', 'false', 'boolean', 'Temporarily pause user-facing trip generation notices.', NULL, '2026-05-19 23:37:40'),
('ml_auto_retrain_enabled', 'false', 'boolean', 'Reserve flag for scheduled recommendation model retraining.', NULL, '2026-05-19 23:37:40');

-- --------------------------------------------------------

--
-- Table structure for table `email_logs`
--

CREATE TABLE `email_logs` (
  `id` int(11) NOT NULL,
  `queue_id` int(11) DEFAULT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `recipient_user_id` int(11) DEFAULT NULL,
  `subject` varchar(200) NOT NULL,
  `template_name` varchar(120) NOT NULL,
  `category` varchar(40) NOT NULL,
  `provider` varchar(30) NOT NULL,
  `status` varchar(20) NOT NULL,
  `response_code` varchar(40) DEFAULT NULL,
  `response_body` mediumtext DEFAULT NULL,
  `provider_message_id` varchar(160) DEFAULT NULL,
  `attempt_number` int(11) NOT NULL DEFAULT 1,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`payload`)),
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `email_logs`
--

INSERT INTO `email_logs` (`id`, `queue_id`, `recipient_email`, `recipient_user_id`, `subject`, `template_name`, `category`, `provider`, `status`, `response_code`, `response_body`, `provider_message_id`, `attempt_number`, `payload`, `created_at`) VALUES
(1, 1, '0323-3883@lspu.edu.ph', 5, 'Welcome to Ano Tara!', 'welcome', 'messages', 'sendgrid', 'sent', '202', '', 'jEECQCy2QrOO2cTgMpne7Q', 1, '{\"recipient_user_id\": 5, \"recipient_email\": \"0323-3883@lspu.edu.ph\", \"recipient_name\": \"Paul\", \"subject\": \"Welcome to Ano Tara!\", \"template_name\": \"welcome\", \"category\": \"messages\", \"context\": {\"username\": \"Paul\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"866d91a4715521f6920ea95eb2833071ec19caf9985f5eab7508826fdb9624ee\", \"sent\": true, \"status_code\": 202, \"message_id\": \"jEECQCy2QrOO2cTgMpne7Q\", \"response_body\": \"\"}', '2026-05-21 00:04:29'),
(2, 2, '0323-3883@lspu.edu.ph', 5, 'Your itinerary for Samar was saved', 'itinerary_saved', 'itinerary_updates', 'sendgrid', 'sent', '202', '', 'motikb0ASG2VkuKktD1VEA', 1, '{\"recipient_user_id\": 5, \"recipient_email\": \"0323-3883@lspu.edu.ph\", \"recipient_name\": \"Paul\", \"subject\": \"Your itinerary for Samar was saved\", \"template_name\": \"itinerary_saved\", \"category\": \"itinerary_updates\", \"context\": {\"recipient_name\": \"Paul\", \"destination\": \"Samar\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"7f95813f521867ff68f0103e4dbb2ac47a010b302ecf4f61bec96d9f5028cd9e\", \"sent\": true, \"status_code\": 202, \"message_id\": \"motikb0ASG2VkuKktD1VEA\", \"response_body\": \"\"}', '2026-05-21 00:06:07'),
(3, 3, 'paolomamugay5@gmail.com', 7, 'Welcome to Ano Tara!', 'welcome', 'messages', 'sendgrid', 'sent', '202', '', 'TePZLxLnSPmz2e9TjOqfRQ', 1, '{\"recipient_user_id\": 7, \"recipient_email\": \"paolomamugay5@gmail.com\", \"recipient_name\": \"pao\", \"subject\": \"Welcome to Ano Tara!\", \"template_name\": \"welcome\", \"category\": \"messages\", \"context\": {\"username\": \"pao\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"8571df8425b35f430923249e5d840943007f6681229dc307c067e7b8128ba1b6\", \"sent\": true, \"status_code\": 202, \"message_id\": \"TePZLxLnSPmz2e9TjOqfRQ\", \"response_body\": \"\"}', '2026-05-21 00:07:36'),
(4, 4, 'paolomamugay5@gmail.com', 7, 'Paul sent you a friend request', 'friend_request', 'collaboration', 'sendgrid', 'sent', '202', '', 'fbiGpWKERs-bM53-o-zI9g', 1, '{\"recipient_user_id\": 7, \"recipient_email\": \"paolomamugay5@gmail.com\", \"recipient_name\": \"pao\", \"subject\": \"Paul sent you a friend request\", \"template_name\": \"friend_request\", \"category\": \"collaboration\", \"context\": {\"recipient_name\": \"pao\", \"sender_name\": \"Paul\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"87305d0e8f7b3f21c61313aafeb8bc034a69fa8c3dccd712910e64859aec69ca\", \"sent\": true, \"status_code\": 202, \"message_id\": \"fbiGpWKERs-bM53-o-zI9g\", \"response_body\": \"\"}', '2026-05-21 00:08:48'),
(5, 5, '0323-3883@lspu.edu.ph', 5, 'pao accepted your friend request', 'friend_response', 'collaboration', 'sendgrid', 'sent', '202', '', 'ukF7pvu8QL6fVt_DCjptdw', 1, '{\"recipient_user_id\": 5, \"recipient_email\": \"0323-3883@lspu.edu.ph\", \"recipient_name\": \"Paul\", \"subject\": \"pao accepted your friend request\", \"template_name\": \"friend_response\", \"category\": \"collaboration\", \"context\": {\"recipient_name\": \"Paul\", \"responder_name\": \"pao\", \"decision_text\": \"accepted\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"e2bb63971757e2e094ab73eb44ee075bb0e3c2fa5509644f04627148f7077bbb\", \"sent\": true, \"status_code\": 202, \"message_id\": \"ukF7pvu8QL6fVt_DCjptdw\", \"response_body\": \"\"}', '2026-05-21 00:10:09'),
(6, 6, 'paolomamugay5@gmail.com', 7, 'You were invited to collaborate on Trip to Samar', 'collaborator_invite', 'collaboration', 'sendgrid', 'sent', '202', '', 'ZklSeooOTemy2x77hOO93w', 1, '{\"recipient_user_id\": 7, \"recipient_email\": \"paolomamugay5@gmail.com\", \"recipient_name\": \"pao\", \"subject\": \"You were invited to collaborate on Trip to Samar\", \"template_name\": \"collaborator_invite\", \"category\": \"collaboration\", \"context\": {\"recipient_name\": \"pao\", \"inviter_name\": \"Paul\", \"trip_name\": \"Trip to Samar\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"d6f625fc56a8e3ab958dece7a3fc09e185835479a1dd03783a8d55d1bc661644\", \"sent\": true, \"status_code\": 202, \"message_id\": \"ZklSeooOTemy2x77hOO93w\", \"response_body\": \"\"}', '2026-05-21 00:10:38'),
(7, 2, '0323-3883@lspu.edu.ph', 5, 'Your itinerary for Samar was saved', 'itinerary_saved', 'itinerary_updates', 'sendgrid', 'sent', '202', '', '6Aw5iJW2T3GzhtJz6FfjEQ', 1, '{\"recipient_user_id\": 5, \"recipient_email\": \"0323-3883@lspu.edu.ph\", \"recipient_name\": \"Paul\", \"subject\": \"Your itinerary for Samar was saved\", \"template_name\": \"itinerary_saved\", \"category\": \"itinerary_updates\", \"context\": {\"recipient_name\": \"Paul\", \"destination\": \"Samar\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"7f95813f521867ff68f0103e4dbb2ac47a010b302ecf4f61bec96d9f5028cd9e\", \"sent\": true, \"status_code\": 202, \"message_id\": \"6Aw5iJW2T3GzhtJz6FfjEQ\", \"response_body\": \"\"}', '2026-05-21 00:14:53'),
(8, 8, 'paolomamugay5@gmail.com', 7, 'Your itinerary for Batangas was saved', 'itinerary_saved', 'itinerary_updates', 'sendgrid', 'sent', '202', '', '7o1rT_6ZRAyR6b2jh2P32w', 1, '{\"recipient_user_id\": 7, \"recipient_email\": \"paolomamugay5@gmail.com\", \"recipient_name\": \"pao\", \"subject\": \"Your itinerary for Batangas was saved\", \"template_name\": \"itinerary_saved\", \"category\": \"itinerary_updates\", \"context\": {\"recipient_name\": \"pao\", \"destination\": \"Batangas\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"4b16bb296c49fff5cd4fc4f4a5377d3c1739fe55e243f38f44bca29d863b2a68\", \"sent\": true, \"status_code\": 202, \"message_id\": \"7o1rT_6ZRAyR6b2jh2P32w\", \"response_body\": \"\"}', '2026-05-21 00:15:25'),
(9, 9, 'paolomamugay5@gmail.com', 7, 'Your itinerary for Dinagat Islands was saved', 'itinerary_saved', 'itinerary_updates', 'sendgrid', 'sent', '202', '', 'ubXt-OORQOmutk-POtUj8Q', 1, '{\"recipient_user_id\": 7, \"recipient_email\": \"paolomamugay5@gmail.com\", \"recipient_name\": \"pao\", \"subject\": \"Your itinerary for Dinagat Islands was saved\", \"template_name\": \"itinerary_saved\", \"category\": \"itinerary_updates\", \"context\": {\"recipient_name\": \"pao\", \"destination\": \"Dinagat Islands\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"a0c81e46d52c2a2467942a88bd768ea16ba6c4123b4135220c23f84fbdd36ce8\", \"sent\": true, \"status_code\": 202, \"message_id\": \"ubXt-OORQOmutk-POtUj8Q\", \"response_body\": \"\"}', '2026-05-21 00:18:41'),
(10, 10, '0323-3883@lspu.edu.ph', 5, 'You were invited to collaborate on Trip to Dinagat Islands', 'collaborator_invite', 'collaboration', 'sendgrid', 'sent', '202', '', '6pNTOLoWRpuFoWkzklwHOg', 1, '{\"recipient_user_id\": 5, \"recipient_email\": \"0323-3883@lspu.edu.ph\", \"recipient_name\": \"Paul\", \"subject\": \"You were invited to collaborate on Trip to Dinagat Islands\", \"template_name\": \"collaborator_invite\", \"category\": \"collaboration\", \"context\": {\"recipient_name\": \"Paul\", \"inviter_name\": \"pao\", \"trip_name\": \"Trip to Dinagat Islands\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"355c1c88c79309439aba7e143df4a6d0e1230c3c1513d2ba81fef68ffa621e77\", \"sent\": true, \"status_code\": 202, \"message_id\": \"6pNTOLoWRpuFoWkzklwHOg\", \"response_body\": \"\"}', '2026-05-21 00:19:19'),
(11, 11, 'paolomamugay5@gmail.com', 7, 'Your itinerary for Bukidnon was saved', 'itinerary_saved', 'itinerary_updates', 'sendgrid', 'sent', '202', '', 'c0hhY5iDRBam0Bnitto-9w', 1, '{\"recipient_user_id\": 7, \"recipient_email\": \"paolomamugay5@gmail.com\", \"recipient_name\": \"pao\", \"subject\": \"Your itinerary for Bukidnon was saved\", \"template_name\": \"itinerary_saved\", \"category\": \"itinerary_updates\", \"context\": {\"recipient_name\": \"pao\", \"destination\": \"Bukidnon\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"6439b0c3c6772c5a1a142ad4d326888d9d1114022ab4c37c99c188dcd1de381c\", \"sent\": true, \"status_code\": 202, \"message_id\": \"c0hhY5iDRBam0Bnitto-9w\", \"response_body\": \"\"}', '2026-05-21 00:26:20'),
(12, 12, '0323-3883@lspu.edu.ph', 5, 'You were invited to collaborate on Trip to Bukidnon', 'collaborator_invite', 'collaboration', 'sendgrid', 'sent', '202', '', 'ryXV9Ju0QU6OZS8fnobrLw', 1, '{\"recipient_user_id\": 5, \"recipient_email\": \"0323-3883@lspu.edu.ph\", \"recipient_name\": \"Paul\", \"subject\": \"You were invited to collaborate on Trip to Bukidnon\", \"template_name\": \"collaborator_invite\", \"category\": \"collaboration\", \"context\": {\"recipient_name\": \"Paul\", \"inviter_name\": \"pao\", \"trip_name\": \"Trip to Bukidnon\", \"app_name\": \"Ano Tara!\", \"support_email\": \"paulpaolomamugay6@gmail.com\", \"base_url\": \"\"}, \"provider\": \"sendgrid\", \"send_at\": null, \"priority\": 50, \"max_attempts\": 5, \"dedupe_key\": \"0731f67192542543a660d7cf66dc31454f5a714dd8a5192c29dfedfd913a55b5\", \"sent\": true, \"status_code\": 202, \"message_id\": \"ryXV9Ju0QU6OZS8fnobrLw\", \"response_body\": \"\"}', '2026-05-21 00:26:55');

-- --------------------------------------------------------

--
-- Table structure for table `email_queue`
--

CREATE TABLE `email_queue` (
  `id` int(11) NOT NULL,
  `recipient_user_id` int(11) DEFAULT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `recipient_name` varchar(120) DEFAULT NULL,
  `subject` varchar(200) NOT NULL,
  `template_name` varchar(120) NOT NULL,
  `category` varchar(40) NOT NULL DEFAULT 'messages',
  `context` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`context`)),
  `provider` varchar(30) NOT NULL DEFAULT 'disabled',
  `status` varchar(20) NOT NULL DEFAULT 'queued',
  `priority` int(11) NOT NULL DEFAULT 50,
  `attempts` int(11) NOT NULL DEFAULT 0,
  `max_attempts` int(11) NOT NULL DEFAULT 5,
  `send_at` datetime DEFAULT NULL,
  `dedupe_key` char(64) NOT NULL,
  `last_error` text DEFAULT NULL,
  `provider_message_id` varchar(160) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `queued_at` datetime DEFAULT current_timestamp(),
  `sent_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `email_queue`
--

INSERT INTO `email_queue` (`id`, `recipient_user_id`, `recipient_email`, `recipient_name`, `subject`, `template_name`, `category`, `context`, `provider`, `status`, `priority`, `attempts`, `max_attempts`, `send_at`, `dedupe_key`, `last_error`, `provider_message_id`, `created_at`, `updated_at`, `queued_at`, `sent_at`, `failed_at`) VALUES
(1, 5, '0323-3883@lspu.edu.ph', 'Paul', 'Welcome to Ano Tara!', 'welcome', 'messages', '{\"username\": \"Paul\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '866d91a4715521f6920ea95eb2833071ec19caf9985f5eab7508826fdb9624ee', NULL, 'jEECQCy2QrOO2cTgMpne7Q', '2026-05-21 00:04:26', '2026-05-21 00:04:29', '2026-05-21 00:04:26', '2026-05-20 16:04:29', NULL),
(2, 5, '0323-3883@lspu.edu.ph', 'Paul', 'Your itinerary for Samar was saved', 'itinerary_saved', 'itinerary_updates', '{\"recipient_name\": \"Paul\", \"destination\": \"Samar\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '7f95813f521867ff68f0103e4dbb2ac47a010b302ecf4f61bec96d9f5028cd9e', NULL, '6Aw5iJW2T3GzhtJz6FfjEQ', '2026-05-21 00:06:06', '2026-05-21 00:14:53', '2026-05-21 00:06:06', '2026-05-20 16:14:53', NULL),
(3, 7, 'paolomamugay5@gmail.com', 'pao', 'Welcome to Ano Tara!', 'welcome', 'messages', '{\"username\": \"pao\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '8571df8425b35f430923249e5d840943007f6681229dc307c067e7b8128ba1b6', NULL, 'TePZLxLnSPmz2e9TjOqfRQ', '2026-05-21 00:07:31', '2026-05-21 00:07:36', '2026-05-21 00:07:31', '2026-05-20 16:07:36', NULL),
(4, 7, 'paolomamugay5@gmail.com', 'pao', 'Paul sent you a friend request', 'friend_request', 'collaboration', '{\"recipient_name\": \"pao\", \"sender_name\": \"Paul\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '87305d0e8f7b3f21c61313aafeb8bc034a69fa8c3dccd712910e64859aec69ca', NULL, 'fbiGpWKERs-bM53-o-zI9g', '2026-05-21 00:08:44', '2026-05-21 00:08:48', '2026-05-21 00:08:44', '2026-05-20 16:08:48', NULL),
(5, 5, '0323-3883@lspu.edu.ph', 'Paul', 'pao accepted your friend request', 'friend_response', 'collaboration', '{\"recipient_name\": \"Paul\", \"responder_name\": \"pao\", \"decision_text\": \"accepted\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, 'e2bb63971757e2e094ab73eb44ee075bb0e3c2fa5509644f04627148f7077bbb', NULL, 'ukF7pvu8QL6fVt_DCjptdw', '2026-05-21 00:10:05', '2026-05-21 00:10:09', '2026-05-21 00:10:05', '2026-05-20 16:10:09', NULL),
(6, 7, 'paolomamugay5@gmail.com', 'pao', 'You were invited to collaborate on Trip to Samar', 'collaborator_invite', 'collaboration', '{\"recipient_name\": \"pao\", \"inviter_name\": \"Paul\", \"trip_name\": \"Trip to Samar\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, 'd6f625fc56a8e3ab958dece7a3fc09e185835479a1dd03783a8d55d1bc661644', NULL, 'ZklSeooOTemy2x77hOO93w', '2026-05-21 00:10:32', '2026-05-21 00:10:38', '2026-05-21 00:10:32', '2026-05-20 16:10:38', NULL),
(8, 7, 'paolomamugay5@gmail.com', 'pao', 'Your itinerary for Batangas was saved', 'itinerary_saved', 'itinerary_updates', '{\"recipient_name\": \"pao\", \"destination\": \"Batangas\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '4b16bb296c49fff5cd4fc4f4a5377d3c1739fe55e243f38f44bca29d863b2a68', NULL, '7o1rT_6ZRAyR6b2jh2P32w', '2026-05-21 00:15:23', '2026-05-21 00:15:25', '2026-05-21 00:15:23', '2026-05-20 16:15:25', NULL),
(9, 7, 'paolomamugay5@gmail.com', 'pao', 'Your itinerary for Dinagat Islands was saved', 'itinerary_saved', 'itinerary_updates', '{\"recipient_name\": \"pao\", \"destination\": \"Dinagat Islands\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, 'a0c81e46d52c2a2467942a88bd768ea16ba6c4123b4135220c23f84fbdd36ce8', NULL, 'ubXt-OORQOmutk-POtUj8Q', '2026-05-21 00:18:40', '2026-05-21 00:18:41', '2026-05-21 00:18:40', '2026-05-20 16:18:41', NULL),
(10, 5, '0323-3883@lspu.edu.ph', 'Paul', 'You were invited to collaborate on Trip to Dinagat Islands', 'collaborator_invite', 'collaboration', '{\"recipient_name\": \"Paul\", \"inviter_name\": \"pao\", \"trip_name\": \"Trip to Dinagat Islands\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '355c1c88c79309439aba7e143df4a6d0e1230c3c1513d2ba81fef68ffa621e77', NULL, '6pNTOLoWRpuFoWkzklwHOg', '2026-05-21 00:19:16', '2026-05-21 00:19:19', '2026-05-21 00:19:16', '2026-05-20 16:19:19', NULL),
(11, 7, 'paolomamugay5@gmail.com', 'pao', 'Your itinerary for Bukidnon was saved', 'itinerary_saved', 'itinerary_updates', '{\"recipient_name\": \"pao\", \"destination\": \"Bukidnon\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '6439b0c3c6772c5a1a142ad4d326888d9d1114022ab4c37c99c188dcd1de381c', NULL, 'c0hhY5iDRBam0Bnitto-9w', '2026-05-21 00:26:19', '2026-05-21 00:26:20', '2026-05-21 00:26:19', '2026-05-20 16:26:20', NULL),
(12, 5, '0323-3883@lspu.edu.ph', 'Paul', 'You were invited to collaborate on Trip to Bukidnon', 'collaborator_invite', 'collaboration', '{\"recipient_name\": \"Paul\", \"inviter_name\": \"pao\", \"trip_name\": \"Trip to Bukidnon\"}', 'sendgrid', 'sent', 50, 1, 5, NULL, '0731f67192542543a660d7cf66dc31454f5a714dd8a5192c29dfedfd913a55b5', NULL, 'ryXV9Ju0QU6OZS8fnobrLw', '2026-05-21 00:26:53', '2026-05-21 00:26:55', '2026-05-21 00:26:53', '2026-05-20 16:26:55', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `email_suppression`
--

CREATE TABLE `email_suppression` (
  `id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL,
  `reason` varchar(80) NOT NULL,
  `source` varchar(80) NOT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `friendships`
--

CREATE TABLE `friendships` (
  `id` int(11) NOT NULL,
  `requester_id` int(11) NOT NULL,
  `addressee_id` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `friendships`
--

INSERT INTO `friendships` (`id`, `requester_id`, `addressee_id`, `status`, `created_at`, `updated_at`) VALUES
(1, 5, 7, 'accepted', '2026-05-21 00:08:44', '2026-05-21 00:10:05');

-- --------------------------------------------------------

--
-- Table structure for table `hotel_recommendations`
--

CREATE TABLE `hotel_recommendations` (
  `id` int(11) NOT NULL,
  `itinerary_id` int(11) NOT NULL,
  `day_number` int(11) NOT NULL,
  `name` varchar(180) NOT NULL,
  `pitch` text DEFAULT NULL,
  `rating` decimal(3,1) DEFAULT 0.0,
  `price_band` varchar(20) DEFAULT 'comfort',
  `est_price_php` int(11) DEFAULT 0,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `booking_url` varchar(400) DEFAULT NULL,
  `thumbnail_url` varchar(400) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `hotel_recommendations`
--

INSERT INTO `hotel_recommendations` (`id`, `itinerary_id`, `day_number`, `name`, `pitch`, `rating`, `price_band`, `est_price_php`, `latitude`, `longitude`, `booking_url`, `thumbnail_url`, `created_at`) VALUES
(1, 1, 1, 'Angelito\'s Pizza and Restaurant', 'Located within minutes of your final stop on Day 1 — a luxury pick that keeps you close to tomorrow\'s first activity.', 3.5, 'high', 7800, 14.7995020, 120.5372115, 'https://www.booking.com/search.html?ss=Angelito\'s+Pizza+and+Restaurant', NULL, '2026-05-19 23:43:01'),
(5, 2, 1, 'Bindoy Town Park', 'Located within minutes of your final stop on Day 1 — a luxury pick that keeps you close to tomorrow\'s first activity.', 3.5, 'high', 7800, 9.7642551, 123.1435210, 'https://www.booking.com/search.html?ss=Bindoy+Town+Park', NULL, '2026-05-19 23:50:44'),
(6, 3, 1, 'Baluarte', 'Located within minutes of your final stop on Day 1 — a comfort pick that keeps you close to tomorrow\'s first activity.', 3.5, 'comfort', 2800, 9.5208888, 123.4354567, 'https://www.booking.com/search.html?ss=Baluarte', NULL, '2026-05-20 18:11:37'),
(7, 3, 5, 'Baluarte', 'Located within minutes of your final stop on Day 5 — a comfort pick that keeps you close to tomorrow\'s first activity.', 3.5, 'comfort', 2800, 9.5208888, 123.4354567, 'https://www.booking.com/search.html?ss=Baluarte', NULL, '2026-05-20 18:11:52'),
(8, 4, 1, 'Bukid Layawon', 'Located within minutes of your final stop on Day 1 — a backpacker pick that keeps you close to tomorrow\'s first activity.', 3.5, 'low', 950, 12.0024009, 124.7820245, 'https://www.booking.com/search.html?ss=Bukid+Layawon', NULL, '2026-05-21 00:06:08'),
(9, 5, 1, 'Bukid Layawon', 'Located within minutes of your final stop on Day 1 — a backpacker pick that keeps you close to tomorrow\'s first activity.', 3.5, 'low', 950, 12.0024009, 124.7820245, 'https://www.booking.com/search.html?ss=Bukid+Layawon', NULL, '2026-05-21 00:14:56'),
(10, 6, 1, 'BaaBaa', 'Located within minutes of your final stop on Day 1 — a backpacker pick that keeps you close to tomorrow\'s first activity.', 3.5, 'low', 950, 13.9400090, 121.1618873, 'https://www.booking.com/search.html?ss=BaaBaa', NULL, '2026-05-21 00:15:28'),
(11, 7, 1, 'Break Thru Grill & Restaurant', 'Located within minutes of your final stop on Day 1 — a luxury pick that keeps you close to tomorrow\'s first activity.', 3.5, 'high', 7800, 9.7823870, 125.5004666, 'https://www.booking.com/search.html?ss=Break+Thru+Grill+&+Restaurant', NULL, '2026-05-21 00:18:41'),
(12, 7, 2, 'Break Thru Grill & Restaurant', 'Located within minutes of your final stop on Day 2 — a luxury pick that keeps you close to tomorrow\'s first activity.', 3.5, 'high', 7800, 9.7823870, 125.5004666, 'https://www.booking.com/search.html?ss=Break+Thru+Grill+&+Restaurant', NULL, '2026-05-21 00:22:33'),
(13, 8, 1, 'Capitol Grounds', 'Located within minutes of your final stop on Day 1 — a luxury pick that keeps you close to tomorrow\'s first activity.', 3.5, 'high', 7800, 8.1555999, 125.1320172, 'https://www.booking.com/search.html?ss=Capitol+Grounds', NULL, '2026-05-21 00:26:21'),
(14, 8, 2, 'Capitol Grounds', 'Located within minutes of your final stop on Day 2 — a luxury pick that keeps you close to tomorrow\'s first activity.', 3.5, 'high', 7800, 8.1555999, 125.1320172, 'https://www.booking.com/search.html?ss=Capitol+Grounds', NULL, '2026-05-21 00:27:20');

-- --------------------------------------------------------

--
-- Table structure for table `itineraries`
--

CREATE TABLE `itineraries` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `trip_name` varchar(100) DEFAULT NULL,
  `destination` varchar(100) DEFAULT NULL,
  `budget` varchar(20) DEFAULT NULL,
  `num_days` int(11) DEFAULT NULL,
  `preferences` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`preferences`)),
  `pacing_style` varchar(20) DEFAULT 'Moderate',
  `companion_type` varchar(30) DEFAULT 'Solo',
  `transport_mode` varchar(20) DEFAULT 'Public',
  `accommodation_lat` decimal(10,7) DEFAULT NULL,
  `accommodation_lng` decimal(10,7) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Active',
  `trip_start_date` date DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `itineraries`
--

INSERT INTO `itineraries` (`id`, `user_id`, `trip_name`, `destination`, `budget`, `num_days`, `preferences`, `pacing_style`, `companion_type`, `transport_mode`, `accommodation_lat`, `accommodation_lng`, `status`, `trip_start_date`, `created_at`) VALUES
(1, 1, 'Trip to Bataan', 'Bataan', 'high', 3, '[\"food\", \"nature\", \"museums\"]', 'Packed', 'Family_Kids', 'Private_Car', 14.6795670, 120.5409690, 'Active', '2026-05-19', '2026-05-19 23:43:00'),
(2, 1, 'Trip to Mindanao', 'Mindanao', 'high', 2, '[\"beach\", \"nature\"]', 'Moderate', 'Seniors', 'Private_Car', 13.7737256, 123.8633907, 'Active', '2026-05-20', '2026-05-19 23:50:43'),
(3, 1, 'Trip to Mindanao', 'Mindanao', 'comfort', 10, '[]', 'Moderate', 'Solo', 'Public', 9.6442510, 123.3440600, 'Active', '2026-05-23', '2026-05-20 18:11:37'),
(4, 5, 'Trip to Samar', 'Samar', 'low', 2, '[\"nature\"]', 'Relaxed', 'Family_Kids', 'Walking', 13.7737256, 123.8633907, 'Active', '2026-05-22', '2026-05-21 00:06:06'),
(5, 5, 'Trip to Samar', 'Samar', 'low', 3, '[\"nature\", \"food\", \"nightlife\"]', 'Relaxed', 'Family_Kids', 'Motorcycle', 13.7737256, 123.8633907, 'Active', '2026-05-22', '2026-05-21 00:14:50'),
(6, 7, 'Trip to Batangas', 'Batangas', 'low', 3, '[\"nature\", \"food\", \"nightlife\"]', 'Moderate', 'Friends', 'Motorcycle', 13.7563670, 121.0583900, 'Active', '2026-05-15', '2026-05-21 00:15:23'),
(7, 7, 'Trip to Dinagat Islands', 'Dinagat Islands', 'high', 2, '[\"nature\", \"food\", \"beach\"]', 'Moderate', 'Family_Kids', 'Walking', 7.0539851, 125.5231905, 'Active', '2026-05-21', '2026-05-21 00:18:40'),
(8, 7, 'Trip to Bukidnon', 'Bukidnon', 'high', 2, '[\"nature\"]', 'Packed', 'Family_Kids', 'Motorcycle', 7.0539851, 125.5231905, 'Active', '2026-05-22', '2026-05-21 00:26:19');

-- --------------------------------------------------------

--
-- Table structure for table `itinerary_items`
--

CREATE TABLE `itinerary_items` (
  `id` int(11) NOT NULL,
  `itinerary_id` int(11) NOT NULL,
  `day_number` int(11) NOT NULL,
  `place_id` int(11) NOT NULL,
  `sequence_order` int(11) NOT NULL DEFAULT 1,
  `estimated_duration` int(11) DEFAULT 60,
  `is_locked` tinyint(1) DEFAULT 0,
  `swap_history` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `itinerary_items`
--

INSERT INTO `itinerary_items` (`id`, `itinerary_id`, `day_number`, `place_id`, `sequence_order`, `estimated_duration`, `is_locked`, `swap_history`) VALUES
(1, 1, 1, 1, 1, 120, 0, 0),
(2, 1, 1, 2, 2, 120, 0, 0),
(3, 1, 1, 3, 3, 225, 0, 0),
(4, 1, 1, 4, 4, 120, 0, 0),
(5, 1, 2, 5, 1, 120, 0, 0),
(6, 1, 2, 6, 2, 120, 0, 0),
(7, 1, 2, 7, 3, 120, 0, 0),
(8, 1, 2, 8, 4, 120, 0, 0),
(9, 1, 3, 9, 1, 120, 0, 0),
(10, 1, 3, 10, 2, 120, 0, 0),
(11, 1, 3, 11, 3, 120, 0, 0),
(12, 1, 3, 12, 4, 165, 0, 0),
(13, 2, 1, 13, 1, 225, 0, 0),
(14, 2, 1, 14, 2, 225, 0, 0),
(15, 2, 1, 15, 3, 225, 0, 0),
(16, 2, 2, 16, 1, 225, 0, 0),
(17, 2, 2, 17, 2, 225, 0, 0),
(18, 2, 2, 18, 3, 225, 0, 0),
(19, 3, 1, 19, 1, 75, 0, 0),
(20, 3, 1, 20, 2, 75, 0, 0),
(21, 3, 2, 21, 1, 120, 0, 0),
(22, 3, 2, 22, 2, 120, 0, 0),
(23, 3, 3, 23, 1, 120, 0, 0),
(24, 3, 3, 24, 2, 75, 0, 0),
(25, 3, 4, 25, 1, 75, 0, 0),
(26, 3, 4, 26, 2, 75, 0, 0),
(27, 3, 5, 14, 1, 75, 0, 1),
(28, 3, 5, 13, 2, 120, 0, 1),
(29, 3, 6, 29, 1, 75, 0, 0),
(30, 3, 6, 30, 2, 75, 0, 0),
(31, 3, 7, 31, 1, 120, 0, 0),
(32, 3, 7, 32, 2, 120, 0, 0),
(33, 3, 8, 33, 1, 75, 0, 0),
(34, 3, 8, 34, 2, 120, 0, 0),
(35, 3, 9, 35, 1, 75, 0, 0),
(36, 3, 9, 36, 2, 120, 0, 0),
(37, 3, 10, 37, 1, 75, 0, 0),
(38, 3, 10, 38, 2, 120, 0, 0),
(39, 4, 1, 39, 1, 180, 0, 0),
(40, 4, 1, 40, 2, 180, 0, 0),
(41, 4, 2, 41, 1, 180, 0, 0),
(42, 4, 2, 42, 2, 180, 0, 0),
(43, 5, 1, 39, 1, 180, 0, 0),
(44, 5, 1, 44, 2, 75, 0, 0),
(45, 5, 2, 41, 1, 180, 0, 0),
(46, 5, 2, 46, 2, 180, 0, 0),
(47, 5, 3, 47, 1, 180, 0, 0),
(48, 5, 3, 48, 2, 180, 0, 0),
(49, 6, 1, 49, 1, 180, 0, 0),
(50, 6, 1, 50, 2, 75, 0, 0),
(51, 6, 2, 51, 1, 75, 0, 0),
(52, 6, 2, 52, 2, 75, 0, 0),
(53, 6, 3, 53, 1, 75, 0, 0),
(54, 6, 3, 54, 2, 75, 0, 0),
(55, 7, 1, 55, 1, 120, 0, 0),
(56, 7, 1, 56, 2, 120, 0, 0),
(57, 7, 1, 57, 3, 120, 0, 0),
(58, 7, 2, 58, 1, 120, 0, 0),
(59, 7, 2, 59, 3, 120, 0, 0),
(60, 7, 2, 60, 2, 225, 0, 0),
(61, 8, 1, 61, 1, 225, 0, 0),
(62, 8, 1, 62, 2, 150, 0, 0),
(63, 8, 1, 63, 3, 150, 0, 0),
(64, 8, 1, 64, 4, 225, 0, 0),
(65, 8, 2, 65, 1, 225, 0, 0),
(66, 8, 2, 66, 2, 225, 0, 0),
(67, 8, 2, 67, 3, 225, 0, 0),
(68, 8, 2, 68, 4, 225, 0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `itinerary_item_memories`
--

CREATE TABLE `itinerary_item_memories` (
  `id` int(11) NOT NULL,
  `itinerary_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `kind` varchar(20) NOT NULL,
  `note` text DEFAULT NULL,
  `image_data` longtext DEFAULT NULL,
  `mime_type` varchar(40) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `itinerary_item_memories`
--

INSERT INTO `itinerary_item_memories` (`id`, `itinerary_id`, `item_id`, `user_id`, `kind`, `note`, `image_data`, `mime_type`, `created_at`) VALUES
(1, 7, 55, 7, 'photo', NULL, 'data:image/jpeg;base64,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', 'image/jpeg', '2026-05-21 00:21:54'),
(2, 7, 55, 7, 'note', 'Kamote tara?', NULL, NULL, '2026-05-21 00:22:03');

-- --------------------------------------------------------

--
-- Table structure for table `ml_training_runs`
--

CREATE TABLE `ml_training_runs` (
  `id` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'running',
  `dataset_rows` int(11) DEFAULT 0,
  `accuracy` decimal(6,4) DEFAULT NULL,
  `metrics` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metrics`)),
  `artifact_paths` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`artifact_paths`)),
  `started_by` int(11) DEFAULT NULL,
  `started_at` datetime DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  `error_message` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `places`
--

CREATE TABLE `places` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `category` varchar(50) NOT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `rating` decimal(3,1) DEFAULT 0.0,
  `city` varchar(100) DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `environment_type` varchar(20) DEFAULT 'Mixed',
  `physical_intensity` varchar(20) DEFAULT 'Medium',
  `status` varchar(20) NOT NULL DEFAULT 'published',
  `curation_notes` text DEFAULT NULL,
  `source` varchar(40) DEFAULT 'system',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updated_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `places`
--

INSERT INTO `places` (`id`, `name`, `category`, `latitude`, `longitude`, `rating`, `city`, `tags`, `environment_type`, `physical_intensity`, `status`, `curation_notes`, `source`, `updated_at`, `updated_by`) VALUES
(1, 'Angelito\'s Pizza and Restaurant', 'food', 14.7995020, 120.5372115, 3.5, 'Bataan', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(2, 'Mang Inasal', 'food', 14.8016592, 120.5351349, 3.5, 'Bataan', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(3, 'Hermosa Town Plaza', 'nature', 14.8302861, 120.5086181, 3.5, 'Bataan', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(4, 'Saulog Bus Stop Over', 'food', 14.8881364, 120.5268283, 3.5, 'Bataan', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(5, 'Daniel\'s', 'food', 14.9112666, 120.5639045, 3.5, 'Bataan', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(6, 'Soy Teaful', 'food', 14.9114435, 120.5641446, 3.5, 'Bataan', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(7, 'The Hungry Pita', 'food', 14.9127472, 120.5657968, 3.5, 'Bataan', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(8, 'Pares Ni Kap', 'food', 14.8597678, 120.6966491, 3.5, 'Bataan', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(9, 'Camera Cafe', 'food', 14.8176559, 120.7271665, 3.5, 'Bataan', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(10, 'Romalaine Seafood Restaurant', 'food', 14.4614655, 120.5402174, 3.5, 'Bataan', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(11, 'Rudilyn\'s Inn', 'food', 14.4631753, 120.5362536, 3.5, 'Bataan', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(12, 'Mariveles Public Library', 'museums', 14.4360516, 120.4911668, 3.5, 'Bataan', 'education', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-19 23:43:00', NULL),
(13, 'Bindoy Town Park', 'nature', 9.7642551, 123.1435210, 3.5, 'Mindanao', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-19 23:50:43', NULL),
(14, 'Viewing Deck 1', 'nature', 9.5921897, 123.1432239, 3.5, 'Mindanao', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-19 23:50:43', NULL),
(15, 'Oslob Town Plaza', 'nature', 9.5207150, 123.4331263, 3.5, 'Mindanao', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-19 23:50:43', NULL),
(16, 'Plaza Muralla', 'nature', 9.6300616, 123.4799691, 3.5, 'Mindanao', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-19 23:50:43', NULL),
(17, 'Kristory Park', 'nature', 9.8076339, 123.4676382, 3.5, 'Mindanao', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-19 23:50:43', NULL),
(18, 'Rizal Park', 'nature', 9.8704062, 123.3989214, 3.5, 'Mindanao', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-19 23:50:43', NULL),
(19, 'Eatery', 'food', 9.6596207, 123.3243969, 3.5, 'Mindanao', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(20, 'Dulot', 'food', 9.7281156, 123.3398747, 3.5, 'Mindanao', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(21, 'Kanlaob River', 'sightseeing', 9.7553120, 123.3723721, 3.5, 'Mindanao', 'tourism', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(22, 'Padung Osmena2', 'sightseeing', 9.7493333, 123.3812691, 3.5, 'Mindanao', 'tourism', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(23, 'cancalanog falls alegria', 'sightseeing', 9.7684334, 123.3744909, 3.5, 'Mindanao', 'tourism', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(24, 'Nan Hai', 'food', 9.7872482, 123.3460319, 3.5, 'Mindanao', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(25, 'La Cantina Bar & Grill', 'food', 9.7131013, 123.3820838, 3.5, 'Mindanao', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(26, 'Farmhouse Villa', 'food', 9.7125417, 123.3825086, 3.5, 'Mindanao', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(27, 'The Breeze', 'food', 9.6554793, 123.4919548, 3.5, 'Mindanao', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(28, 'Ti gmk', 'sightseeing', 9.6830008, 123.5032611, 3.5, 'Mindanao', 'tourism', 'Outdoor', 'High', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(29, 'Lusapon Beach and Restaurant', 'food', 9.6210100, 123.4782390, 3.5, 'Mindanao', 'catering', 'Outdoor', 'High', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(30, 'Brice BBQ & Grill', 'food', 9.5464031, 123.4492820, 3.5, 'Mindanao', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(31, 'Baluarte', 'sightseeing', 9.5208888, 123.4354567, 3.5, 'Mindanao', 'tourism', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(32, 'Issas Haven', 'sightseeing', 9.5622640, 123.4141487, 3.5, 'Mindanao', 'tourism', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(33, 'Nicolina\'s Place', 'food', 9.5719283, 123.3126838, 3.5, 'Mindanao', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(34, 'Ponong Lake', 'sightseeing', 9.5361292, 123.3052250, 3.5, 'Mindanao', 'tourism', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(35, 'Port Avenue', 'food', 9.4656936, 123.2989521, 3.5, 'Mindanao', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(36, 'Mother Teresa Rooms & Restaurant', 'sightseeing', 9.4639360, 123.3801378, 3.5, 'Mindanao', 'building', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(37, 'Cocina En Acandilado', 'food', 9.4653569, 123.3809307, 3.5, 'Mindanao', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(38, 'Manjuyod  Sandbar', 'sightseeing', 9.6143384, 123.1649392, 3.5, 'Mindanao', 'tourism', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-20 18:11:37', NULL),
(39, 'Bukid Layawon', 'nature', 12.0024009, 124.7820245, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:06:06', NULL),
(40, 'Proposed Park', 'nature', 11.9902948, 124.7878758, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:06:06', NULL),
(41, 'River Viewing Deck (Two Levels)', 'nature', 12.0128593, 124.8123810, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:06:06', NULL),
(42, 'Elevation 105 meters', 'nature', 11.9033889, 124.8212576, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:06:06', NULL),
(43, 'Bukid Layawon', 'nature', 12.0024009, 124.7820245, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:14:50', NULL),
(44, 'Jhunlyn_Variety Store', 'food', 12.0154383, 124.8068412, 3.5, 'Samar', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:14:50', NULL),
(45, 'River Viewing Deck (Two Levels)', 'nature', 12.0128593, 124.8123810, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:14:50', NULL),
(46, 'Imelda Park', 'nature', 11.7742678, 124.8855220, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:14:50', NULL),
(47, 'Office Stress Rest and Air Circulating Area', 'nature', 11.7758006, 125.0198354, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:14:50', NULL),
(48, 'Rizal Triangle', 'nature', 11.7101772, 125.0175631, 3.5, 'Samar', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:14:50', NULL),
(49, 'Plaza Independencia', 'nature', 13.9413192, 121.1643326, 3.5, 'Batangas', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:15:23', NULL),
(50, 'SameSaNiRap - LBN', 'food', 13.9390128, 121.1628775, 3.5, 'Batangas', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:15:23', NULL),
(51, 'BaaBaa', 'food', 13.9400090, 121.1618873, 3.5, 'Batangas', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:15:23', NULL),
(52, 'Lugaw Queen', 'food', 13.9407317, 121.1606335, 3.5, 'Batangas', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:15:23', NULL),
(53, 'Twinkle Blends', 'food', 13.9394791, 121.1563984, 3.5, 'Batangas', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:15:23', NULL),
(54, 'Canteen', 'food', 13.9384711, 121.1658178, 3.5, 'Batangas', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:15:23', NULL),
(55, 'Tuna Republic', 'food', 9.7562737, 125.4824784, 3.5, 'Dinagat Islands', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:18:40', NULL),
(56, 'Mooon Cafe', 'food', 9.7641606, 125.4834935, 3.5, 'Dinagat Islands', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-21 00:18:40', NULL),
(57, 'Flavors', 'food', 9.7718322, 125.4834893, 3.5, 'Dinagat Islands', 'catering', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:18:40', NULL),
(58, 'Navarro Internet Cafe', 'food', 9.7831749, 125.4986351, 3.5, 'Dinagat Islands', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-21 00:18:40', NULL),
(59, 'Break Thru Grill & Restaurant', 'food', 9.7823870, 125.5004666, 3.5, 'Dinagat Islands', 'catering', 'Indoor', 'Low', 'published', NULL, 'system', '2026-05-21 00:18:40', NULL),
(60, 'Libjo Park', 'nature', 10.1966824, 125.5341050, 3.5, 'Dinagat Islands', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:18:40', NULL),
(61, 'Rizal Park', 'nature', 8.0777369, 125.2993345, 3.5, 'Bukidnon', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL),
(62, 'Tourism Site', 'sightseeing', 7.9374994, 125.2674584, 3.5, 'Bukidnon', 'tourism', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL),
(63, 'Eagles Club Valencia', 'sightseeing', 7.9059105, 125.0980425, 3.5, 'Bukidnon', 'tourism', 'Mixed', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL),
(64, 'Maputi Bird Reserve', 'nature', 8.1065411, 125.0349820, 3.5, 'Bukidnon', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL),
(65, 'Plaza Rizal', 'nature', 8.1542243, 125.1289482, 3.5, 'Bukidnon', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL),
(66, 'Capitol Grounds', 'nature', 8.1555999, 125.1320172, 3.5, 'Bukidnon', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL),
(67, 'Kaamulan Grounds', 'nature', 8.1596152, 125.1336692, 3.5, 'Bukidnon', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL),
(68, 'Sumilao Public Park', 'nature', 8.3270752, 124.9779495, 3.5, 'Bukidnon', 'leisure', 'Outdoor', 'Medium', 'published', NULL, 'system', '2026-05-21 00:26:19', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `push_tokens`
--

CREATE TABLE `push_tokens` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `token` text NOT NULL,
  `token_hash` char(64) NOT NULL,
  `platform` varchar(40) DEFAULT 'web',
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `push_tokens`
--

INSERT INTO `push_tokens` (`id`, `user_id`, `token`, `token_hash`, `platform`, `user_agent`, `created_at`, `updated_at`) VALUES
(1, 1, 'd9ufyIAwLreTeGLIqHNYmL:APA91bF_i9ARf5MGGNWGPkkGKYVhw-zrqFawOZZ1KxTsHG37SjXUeYwu4Cav8NiduqAh8wOAWBbZTwIjpKMo2QhWgZO4IVz_tt93a5HiePuidZ9n97_fWNU', 'eddfe7cb07bbecc40f7ab795ef424598e44fe883f057eee9397fb00413d9b10e', 'web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-05-19 23:43:02', '2026-05-20 18:11:38'),
(6, 5, 'd9ufyIAwLreTeGLIqHNYmL:APA91bF_i9ARf5MGGNWGPkkGKYVhw-zrqFawOZZ1KxTsHG37SjXUeYwu4Cav8NiduqAh8wOAWBbZTwIjpKMo2QhWgZO4IVz_tt93a5HiePuidZ9n97_fWNU', 'eddfe7cb07bbecc40f7ab795ef424598e44fe883f057eee9397fb00413d9b10e', 'web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-05-21 00:06:08', '2026-05-21 00:14:58'),
(9, 7, 'd9ufyIAwLreTeGLIqHNYmL:APA91bF_i9ARf5MGGNWGPkkGKYVhw-zrqFawOZZ1KxTsHG37SjXUeYwu4Cav8NiduqAh8wOAWBbZTwIjpKMo2QhWgZO4IVz_tt93a5HiePuidZ9n97_fWNU', 'eddfe7cb07bbecc40f7ab795ef424598e44fe883f057eee9397fb00413d9b10e', 'web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-05-21 00:22:25', '2026-05-21 00:22:25');

-- --------------------------------------------------------

--
-- Table structure for table `trip_activity`
--

CREATE TABLE `trip_activity` (
  `id` int(11) NOT NULL,
  `itinerary_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `action` varchar(40) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `trip_activity`
--

INSERT INTO `trip_activity` (`id`, `itinerary_id`, `user_id`, `action`, `payload`, `created_at`) VALUES
(1, 3, 1, 'swapped_stop', '{\"item_id\": 28, \"name\": \"Bindoy Town Park\", \"day\": 5}', '2026-05-20 18:12:19'),
(2, 3, 1, 'swapped_stop', '{\"item_id\": 27, \"name\": \"Viewing Deck 1\", \"day\": 5}', '2026-05-20 18:12:23'),
(3, 4, 5, 'collaborator_added', '{\"user_id\": 7}', '2026-05-21 00:10:38'),
(4, 7, 7, 'collaborator_added', '{\"user_id\": 5}', '2026-05-21 00:19:19'),
(5, 7, 7, 'memory_photo_added', '{\"item_id\": 55, \"memory_id\": 1}', '2026-05-21 00:21:54'),
(6, 7, 7, 'memory_added', '{\"item_id\": 55, \"kind\": \"photo\"}', '2026-05-21 00:21:54'),
(7, 7, 7, 'memory_note_added', '{\"item_id\": 55, \"memory_id\": 2}', '2026-05-21 00:22:03'),
(8, 7, 7, 'memory_added', '{\"item_id\": 55, \"kind\": \"note\"}', '2026-05-21 00:22:04'),
(9, 7, 7, 'reordered_day', '{\"day\": 2}', '2026-05-21 00:22:49'),
(10, 8, 7, 'collaborator_added', '{\"user_id\": 5}', '2026-05-21 00:26:55');

-- --------------------------------------------------------

--
-- Table structure for table `trip_collaborators`
--

CREATE TABLE `trip_collaborators` (
  `id` int(11) NOT NULL,
  `itinerary_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'editor',
  `invited_by` int(11) DEFAULT NULL,
  `accepted_at` datetime DEFAULT current_timestamp(),
  `last_seen_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `trip_collaborators`
--

INSERT INTO `trip_collaborators` (`id`, `itinerary_id`, `user_id`, `role`, `invited_by`, `accepted_at`, `last_seen_at`) VALUES
(1, 4, 7, 'editor', 5, '2026-05-21 00:10:31', '2026-05-21 00:10:31'),
(2, 7, 5, 'editor', 7, '2026-05-21 00:19:16', '2026-05-21 00:19:16'),
(3, 8, 5, 'editor', 7, '2026-05-21 00:26:53', '2026-05-21 00:26:53');

-- --------------------------------------------------------

--
-- Table structure for table `trip_feedback`
--

CREATE TABLE `trip_feedback` (
  `id` int(11) NOT NULL,
  `itinerary_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `place_id` int(11) NOT NULL,
  `rating_type` varchar(20) NOT NULL,
  `feedback_notes` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `trip_feedback`
--

INSERT INTO `trip_feedback` (`id`, `itinerary_id`, `user_id`, `place_id`, `rating_type`, `feedback_notes`, `created_at`) VALUES
(1, 1, 1, 1, 'Best Pick', NULL, '2026-05-19 23:44:29'),
(2, 1, 1, 2, 'Best Pick', NULL, '2026-05-19 23:44:31'),
(3, 1, 1, 3, 'Best Pick', NULL, '2026-05-19 23:44:34'),
(4, 7, 7, 59, 'Best Pick', NULL, '2026-05-21 00:22:55'),
(5, 7, 7, 60, 'Best Pick', NULL, '2026-05-21 00:22:57'),
(6, 7, 7, 58, 'Best Pick', NULL, '2026-05-21 00:22:59'),
(7, 8, 7, 68, 'Best Pick', NULL, '2026-05-21 00:27:41'),
(8, 8, 7, 67, 'Best Pick', NULL, '2026-05-21 00:27:42'),
(9, 8, 7, 66, 'Best Pick', NULL, '2026-05-21 00:27:45'),
(10, 8, 7, 65, 'Best Pick', NULL, '2026-05-21 00:27:48');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'user',
  `account_status` varchar(20) NOT NULL DEFAULT 'active',
  `suspended_at` datetime DEFAULT NULL,
  `suspended_reason` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `default_budget` varchar(20) DEFAULT 'comfort',
  `companion_vector` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`companion_vector`)),
  `vibe_weights` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`vibe_weights`)),
  `biometric_enabled` tinyint(1) DEFAULT 0,
  `email_preferences` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`email_preferences`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `account_status`, `suspended_at`, `suspended_reason`, `created_at`, `default_budget`, `companion_vector`, `vibe_weights`, `biometric_enabled`, `email_preferences`) VALUES
(1, 'geh', 'admin@library.com', '$2b$12$0p7Wbr/.W/6W2kZt5KEaNeauv31tbz51U1W/phYZNvkFHCpeOTvkK', 'admin', 'active', NULL, NULL, '2026-05-19 23:40:44', 'comfort', NULL, NULL, 0, NULL),
(5, 'Paul', '0323-3883@lspu.edu.ph', '$2b$12$crNCPMpNpCi4zJNrTqZe/OHC21rbOR2St9lE2ItpPQY6ZivnID6VK', 'user', 'active', NULL, NULL, '2026-05-21 00:04:26', 'comfort', NULL, NULL, 1, '{\"security\": true, \"collaboration\": true, \"itinerary_updates\": true, \"weather_alerts\": true, \"messages\": true, \"marketing\": true}'),
(7, 'pao', 'paolomamugay5@gmail.com', '$2b$12$t5mCWiBNd512CtasDtxvI.b2t/UVH37FccqfGL6shIzEtLhVblkmC', 'user', 'active', NULL, NULL, '2026-05-21 00:07:30', 'comfort', NULL, NULL, 0, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `vote_sessions`
--

CREATE TABLE `vote_sessions` (
  `id` int(11) NOT NULL,
  `host_id` int(11) NOT NULL,
  `session_code` varchar(12) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'lobby',
  `current_step` int(11) NOT NULL DEFAULT 1,
  `expires_at` datetime DEFAULT NULL,
  `resolved_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`resolved_payload`)),
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vote_sessions`
--

INSERT INTO `vote_sessions` (`id`, `host_id`, `session_code`, `status`, `current_step`, `expires_at`, `resolved_payload`, `created_at`, `updated_at`) VALUES
(1, 5, 'A6QTSM2X', 'resolved', 7, '2026-05-20 17:42:37', '{\"numDays\": 3, \"pacing_style\": \"Relaxed\", \"transport_mode\": \"Motorcycle\", \"budget\": \"low\", \"preferences\": [\"nature\", \"food\", \"nightlife\"], \"dealbreakers\": [\"vegan\", \"accessible\", \"kid_friendly\"]}', '2026-05-21 00:12:37', '2026-05-21 00:14:22'),
(2, 7, 'PAZ38QGM', 'lobby', 1, '2026-05-20 17:47:23', NULL, '2026-05-21 00:17:23', '2026-05-21 00:17:23');

-- --------------------------------------------------------

--
-- Table structure for table `vote_session_participants`
--

CREATE TABLE `vote_session_participants` (
  `id` int(11) NOT NULL,
  `session_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `joined_at` datetime DEFAULT current_timestamp(),
  `last_seen_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vote_session_participants`
--

INSERT INTO `vote_session_participants` (`id`, `session_id`, `user_id`, `joined_at`, `last_seen_at`) VALUES
(1, 1, 5, '2026-05-21 00:12:37', '2026-05-21 00:14:14'),
(2, 1, 7, '2026-05-21 00:13:03', '2026-05-21 00:14:18'),
(23, 2, 7, '2026-05-21 00:17:23', '2026-05-21 00:17:35');

-- --------------------------------------------------------

--
-- Table structure for table `vote_session_responses`
--

CREATE TABLE `vote_session_responses` (
  `id` int(11) NOT NULL,
  `session_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `question_key` varchar(40) NOT NULL,
  `response` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`response`)),
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vote_session_responses`
--

INSERT INTO `vote_session_responses` (`id`, `session_id`, `user_id`, `question_key`, `response`, `created_at`, `updated_at`) VALUES
(1, 1, 7, 'numDays', '3', '2026-05-21 00:13:15', '2026-05-21 00:13:15'),
(2, 1, 5, 'numDays', '5', '2026-05-21 00:13:27', '2026-05-21 00:13:27'),
(3, 1, 5, 'pacing_style', '\"Relaxed\"', '2026-05-21 00:13:32', '2026-05-21 00:13:32'),
(4, 1, 7, 'pacing_style', '\"Relaxed\"', '2026-05-21 00:13:38', '2026-05-21 00:13:38'),
(5, 1, 5, 'transport_mode', '\"Motorcycle\"', '2026-05-21 00:13:46', '2026-05-21 00:13:46'),
(6, 1, 7, 'transport_mode', '\"Private_Car\"', '2026-05-21 00:13:48', '2026-05-21 00:13:48'),
(7, 1, 5, 'budget', '\"low\"', '2026-05-21 00:13:54', '2026-05-21 00:13:59'),
(9, 1, 5, 'preferences', '[\"nightlife\", \"nature\", \"food\"]', '2026-05-21 00:14:02', '2026-05-21 00:14:03'),
(12, 1, 7, 'preferences', '[\"beach\", \"food\", \"nature\"]', '2026-05-21 00:14:07', '2026-05-21 00:14:08'),
(15, 1, 5, 'dealbreakers', '[\"vegan\", \"accessible\", \"kid_friendly\"]', '2026-05-21 00:14:13', '2026-05-21 00:14:14'),
(18, 1, 7, 'dealbreakers', '[\"needs_signal\", \"vegan\", \"accessible\"]', '2026-05-21 00:14:18', '2026-05-21 00:14:18'),
(21, 2, 7, 'destination', '\"laguna\"', '2026-05-21 00:17:32', '2026-05-21 00:17:35');

-- --------------------------------------------------------

--
-- Table structure for table `weather_alerts`
--

CREATE TABLE `weather_alerts` (
  `id` int(11) NOT NULL,
  `itinerary_id` int(11) NOT NULL,
  `alert_key` varchar(100) NOT NULL,
  `alert_type` varchar(40) NOT NULL,
  `headline` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  `notification_signature` varchar(128) DEFAULT NULL,
  `notification_sent_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `weather_alerts`
--

INSERT INTO `weather_alerts` (`id`, `itinerary_id`, `alert_key`, `alert_type`, `headline`, `message`, `payload`, `is_active`, `created_at`, `updated_at`, `resolved_at`, `notification_signature`, `notification_sent_at`) VALUES
(1, 1, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 1, \"precipitation_probability\": 100, \"weather_code\": 95, \"indoor_alternatives\": [{\"id\": 1, \"name\": \"Angelito\'s Pizza and Restaurant\", \"category\": \"food\", \"latitude\": 14.799502, \"longitude\": 120.5372115, \"rating\": 3.5, \"city\": \"Bataan\", \"tags\": \"catering\", \"environment_type\": \"Indoor\", \"physical_intensity\": \"Low\"}, {\"id\": 9, \"name\": \"Camera Cafe\", \"category\": \"food\", \"latitude\": 14.8176559, \"longitude\": 120.7271665, \"rating\": 3.5, \"city\": \"Bataan\", \"tags\": \"catering\", \"environment_type\": \"Indoor\", \"physical_intensity\": \"Low\"}, {\"id\": 5, \"name\": \"Daniel\'s\", \"category\": \"food\", \"latitude\": 14.9112666, \"longitude\": 120.5639045, \"rating\": 3.5, \"city\": \"Bataan\", \"tags\": \"catering\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 3, \"name\": \"Hermosa Town Plaza\", \"category\": \"nature\", \"latitude\": 14.8302861, \"longitude\": 120.5086181, \"rating\": 3.5, \"city\": \"Bataan\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|100|95\"}', 1, '2026-05-19 23:43:03', '2026-05-19 23:49:12', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|100|95', NULL),
(8, 2, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 1, \"precipitation_probability\": 59, \"weather_code\": 51, \"indoor_alternatives\": [{\"id\": 13, \"name\": \"Bindoy Town Park\", \"category\": \"nature\", \"latitude\": 9.7642551, \"longitude\": 123.143521, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 17, \"name\": \"Kristory Park\", \"category\": \"nature\", \"latitude\": 9.8076339, \"longitude\": 123.4676382, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 15, \"name\": \"Oslob Town Plaza\", \"category\": \"nature\", \"latitude\": 9.520715, \"longitude\": 123.4331263, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 16, \"name\": \"Plaza Muralla\", \"category\": \"nature\", \"latitude\": 9.6300616, \"longitude\": 123.4799691, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|59|51\"}', 1, '2026-05-19 23:50:46', '2026-05-20 18:11:05', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|59|51', NULL),
(20, 3, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 5, \"precipitation_probability\": 86, \"weather_code\": 53, \"indoor_alternatives\": [{\"id\": 31, \"name\": \"Baluarte\", \"category\": \"sightseeing\", \"latitude\": 9.5208888, \"longitude\": 123.4354567, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"tourism\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 13, \"name\": \"Bindoy Town Park\", \"category\": \"nature\", \"latitude\": 9.7642551, \"longitude\": 123.143521, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 30, \"name\": \"Brice BBQ & Grill\", \"category\": \"food\", \"latitude\": 9.5464031, \"longitude\": 123.449282, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"catering\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 23, \"name\": \"cancalanog falls alegria\", \"category\": \"sightseeing\", \"latitude\": 9.7684334, \"longitude\": 123.3744909, \"rating\": 3.5, \"city\": \"Mindanao\", \"tags\": \"tourism\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|5|86|53\"}', 1, '2026-05-20 18:11:39', '2026-05-20 18:11:39', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|5|86|53', NULL),
(21, 4, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 1, \"precipitation_probability\": 94, \"weather_code\": 81, \"indoor_alternatives\": [{\"id\": 39, \"name\": \"Bukid Layawon\", \"category\": \"nature\", \"latitude\": 12.0024009, \"longitude\": 124.7820245, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 42, \"name\": \"Elevation 105 meters\", \"category\": \"nature\", \"latitude\": 11.9033889, \"longitude\": 124.8212576, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 40, \"name\": \"Proposed Park\", \"category\": \"nature\", \"latitude\": 11.9902948, \"longitude\": 124.7878758, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 41, \"name\": \"River Viewing Deck (Two Levels)\", \"category\": \"nature\", \"latitude\": 12.0128593, \"longitude\": 124.812381, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|94|81\"}', 1, '2026-05-21 00:06:09', '2026-05-21 00:12:32', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|94|81', NULL),
(27, 5, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 2, \"precipitation_probability\": 94, \"weather_code\": 81, \"indoor_alternatives\": [{\"id\": 39, \"name\": \"Bukid Layawon\", \"category\": \"nature\", \"latitude\": 12.0024009, \"longitude\": 124.7820245, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 43, \"name\": \"Bukid Layawon\", \"category\": \"nature\", \"latitude\": 12.0024009, \"longitude\": 124.7820245, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 42, \"name\": \"Elevation 105 meters\", \"category\": \"nature\", \"latitude\": 11.9033889, \"longitude\": 124.8212576, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 46, \"name\": \"Imelda Park\", \"category\": \"nature\", \"latitude\": 11.7742678, \"longitude\": 124.885522, \"rating\": 3.5, \"city\": \"Samar\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|2|94|81\"}', 1, '2026-05-21 00:15:03', '2026-05-21 00:15:58', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|2|94|81', NULL),
(28, 6, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 1, \"precipitation_probability\": 43, \"weather_code\": 51, \"indoor_alternatives\": [{\"id\": 51, \"name\": \"BaaBaa\", \"category\": \"food\", \"latitude\": 13.940009, \"longitude\": 121.1618873, \"rating\": 3.5, \"city\": \"Batangas\", \"tags\": \"catering\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 54, \"name\": \"Canteen\", \"category\": \"food\", \"latitude\": 13.9384711, \"longitude\": 121.1658178, \"rating\": 3.5, \"city\": \"Batangas\", \"tags\": \"catering\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 52, \"name\": \"Lugaw Queen\", \"category\": \"food\", \"latitude\": 13.9407317, \"longitude\": 121.1606335, \"rating\": 3.5, \"city\": \"Batangas\", \"tags\": \"catering\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 49, \"name\": \"Plaza Independencia\", \"category\": \"nature\", \"latitude\": 13.9413192, \"longitude\": 121.1643326, \"rating\": 3.5, \"city\": \"Batangas\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|43|51\"}', 1, '2026-05-21 00:15:34', '2026-05-21 00:16:16', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|1|43|51', NULL),
(35, 7, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 2, \"precipitation_probability\": 88, \"weather_code\": 81, \"indoor_alternatives\": [{\"id\": 59, \"name\": \"Break Thru Grill & Restaurant\", \"category\": \"food\", \"latitude\": 9.782387, \"longitude\": 125.5004666, \"rating\": 3.5, \"city\": \"Dinagat Islands\", \"tags\": \"catering\", \"environment_type\": \"Indoor\", \"physical_intensity\": \"Low\"}, {\"id\": 57, \"name\": \"Flavors\", \"category\": \"food\", \"latitude\": 9.7718322, \"longitude\": 125.4834893, \"rating\": 3.5, \"city\": \"Dinagat Islands\", \"tags\": \"catering\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 60, \"name\": \"Libjo Park\", \"category\": \"nature\", \"latitude\": 10.1966824, \"longitude\": 125.534105, \"rating\": 3.5, \"city\": \"Dinagat Islands\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 56, \"name\": \"Mooon Cafe\", \"category\": \"food\", \"latitude\": 9.7641606, \"longitude\": 125.4834935, \"rating\": 3.5, \"city\": \"Dinagat Islands\", \"tags\": \"catering\", \"environment_type\": \"Indoor\", \"physical_intensity\": \"Low\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|2|88|81\"}', 1, '2026-05-21 00:18:42', '2026-05-21 00:23:52', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|2|88|81', NULL),
(55, 8, 'weather-pivot', 'weather-risk', 'Weather alert detected', 'Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.', '{\"alert\": true, \"headline\": \"Weather alert detected\", \"message\": \"Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.\", \"focus_day\": 2, \"precipitation_probability\": 88, \"weather_code\": 81, \"indoor_alternatives\": [{\"id\": 66, \"name\": \"Capitol Grounds\", \"category\": \"nature\", \"latitude\": 8.1555999, \"longitude\": 125.1320172, \"rating\": 3.5, \"city\": \"Bukidnon\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 63, \"name\": \"Eagles Club Valencia\", \"category\": \"sightseeing\", \"latitude\": 7.9059105, \"longitude\": 125.0980425, \"rating\": 3.5, \"city\": \"Bukidnon\", \"tags\": \"tourism\", \"environment_type\": \"Mixed\", \"physical_intensity\": \"Medium\"}, {\"id\": 67, \"name\": \"Kaamulan Grounds\", \"category\": \"nature\", \"latitude\": 8.1596152, \"longitude\": 125.1336692, \"rating\": 3.5, \"city\": \"Bukidnon\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}, {\"id\": 64, \"name\": \"Maputi Bird Reserve\", \"category\": \"nature\", \"latitude\": 8.1065411, \"longitude\": 125.034982, \"rating\": 3.5, \"city\": \"Bukidnon\", \"tags\": \"leisure\", \"environment_type\": \"Outdoor\", \"physical_intensity\": \"Medium\"}], \"notification_signature\": \"Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|2|88|81\"}', 1, '2026-05-21 00:26:22', '2026-05-21 00:28:06', NULL, 'Weather alert detected|Rain risk is high, so indoor alternatives are ready for the most exposed part of the trip.|2|88|81', NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin_audit_log`
--
ALTER TABLE `admin_audit_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `actor_id` (`actor_id`);

--
-- Indexes for table `admin_notification_log`
--
ALTER TABLE `admin_notification_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `actor_id` (`actor_id`),
  ADD KEY `target_user_id` (`target_user_id`);

--
-- Indexes for table `admin_settings`
--
ALTER TABLE `admin_settings`
  ADD PRIMARY KEY (`setting_key`),
  ADD KEY `updated_by` (`updated_by`);

--
-- Indexes for table `email_logs`
--
ALTER TABLE `email_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `queue_id` (`queue_id`);

--
-- Indexes for table `email_queue`
--
ALTER TABLE `email_queue`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_email_dedupe` (`dedupe_key`);

--
-- Indexes for table `email_suppression`
--
ALTER TABLE `email_suppression`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_suppressed_email` (`email`);

--
-- Indexes for table `friendships`
--
ALTER TABLE `friendships`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_friend_pair` (`requester_id`,`addressee_id`),
  ADD KEY `addressee_id` (`addressee_id`);

--
-- Indexes for table `hotel_recommendations`
--
ALTER TABLE `hotel_recommendations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_hotel_per_day` (`itinerary_id`,`day_number`);

--
-- Indexes for table `itineraries`
--
ALTER TABLE `itineraries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `itinerary_items`
--
ALTER TABLE `itinerary_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `itinerary_id` (`itinerary_id`),
  ADD KEY `place_id` (`place_id`);

--
-- Indexes for table `itinerary_item_memories`
--
ALTER TABLE `itinerary_item_memories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `itinerary_id` (`itinerary_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `ml_training_runs`
--
ALTER TABLE `ml_training_runs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `started_by` (`started_by`);

--
-- Indexes for table `places`
--
ALTER TABLE `places`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `push_tokens`
--
ALTER TABLE `push_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_push_token` (`user_id`,`token_hash`);

--
-- Indexes for table `trip_activity`
--
ALTER TABLE `trip_activity`
  ADD PRIMARY KEY (`id`),
  ADD KEY `itinerary_id` (`itinerary_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `trip_collaborators`
--
ALTER TABLE `trip_collaborators`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_collab_pair` (`itinerary_id`,`user_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `trip_feedback`
--
ALTER TABLE `trip_feedback`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_trip_feedback` (`itinerary_id`,`user_id`,`place_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `place_id` (`place_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `vote_sessions`
--
ALTER TABLE `vote_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `session_code` (`session_code`),
  ADD KEY `host_id` (`host_id`);

--
-- Indexes for table `vote_session_participants`
--
ALTER TABLE `vote_session_participants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_participant` (`session_id`,`user_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `vote_session_responses`
--
ALTER TABLE `vote_session_responses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_vote_response` (`session_id`,`user_id`,`question_key`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `weather_alerts`
--
ALTER TABLE `weather_alerts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_weather_alert` (`itinerary_id`,`alert_key`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admin_audit_log`
--
ALTER TABLE `admin_audit_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `admin_notification_log`
--
ALTER TABLE `admin_notification_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `email_logs`
--
ALTER TABLE `email_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `email_queue`
--
ALTER TABLE `email_queue`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `email_suppression`
--
ALTER TABLE `email_suppression`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `friendships`
--
ALTER TABLE `friendships`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `hotel_recommendations`
--
ALTER TABLE `hotel_recommendations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `itineraries`
--
ALTER TABLE `itineraries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `itinerary_items`
--
ALTER TABLE `itinerary_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=69;

--
-- AUTO_INCREMENT for table `itinerary_item_memories`
--
ALTER TABLE `itinerary_item_memories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `ml_training_runs`
--
ALTER TABLE `ml_training_runs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `places`
--
ALTER TABLE `places`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=69;

--
-- AUTO_INCREMENT for table `push_tokens`
--
ALTER TABLE `push_tokens`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `trip_activity`
--
ALTER TABLE `trip_activity`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `trip_collaborators`
--
ALTER TABLE `trip_collaborators`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `trip_feedback`
--
ALTER TABLE `trip_feedback`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `vote_sessions`
--
ALTER TABLE `vote_sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `vote_session_participants`
--
ALTER TABLE `vote_session_participants`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=28;

--
-- AUTO_INCREMENT for table `vote_session_responses`
--
ALTER TABLE `vote_session_responses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT for table `weather_alerts`
--
ALTER TABLE `weather_alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=60;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `admin_audit_log`
--
ALTER TABLE `admin_audit_log`
  ADD CONSTRAINT `admin_audit_log_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `admin_notification_log`
--
ALTER TABLE `admin_notification_log`
  ADD CONSTRAINT `admin_notification_log_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `admin_notification_log_ibfk_2` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `admin_settings`
--
ALTER TABLE `admin_settings`
  ADD CONSTRAINT `admin_settings_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `email_logs`
--
ALTER TABLE `email_logs`
  ADD CONSTRAINT `email_logs_ibfk_1` FOREIGN KEY (`queue_id`) REFERENCES `email_queue` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `friendships`
--
ALTER TABLE `friendships`
  ADD CONSTRAINT `friendships_ibfk_1` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `friendships_ibfk_2` FOREIGN KEY (`addressee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `hotel_recommendations`
--
ALTER TABLE `hotel_recommendations`
  ADD CONSTRAINT `hotel_recommendations_ibfk_1` FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `itineraries`
--
ALTER TABLE `itineraries`
  ADD CONSTRAINT `itineraries_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `itinerary_items`
--
ALTER TABLE `itinerary_items`
  ADD CONSTRAINT `itinerary_items_ibfk_1` FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `itinerary_items_ibfk_2` FOREIGN KEY (`place_id`) REFERENCES `places` (`id`);

--
-- Constraints for table `itinerary_item_memories`
--
ALTER TABLE `itinerary_item_memories`
  ADD CONSTRAINT `itinerary_item_memories_ibfk_1` FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `itinerary_item_memories_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `ml_training_runs`
--
ALTER TABLE `ml_training_runs`
  ADD CONSTRAINT `ml_training_runs_ibfk_1` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `push_tokens`
--
ALTER TABLE `push_tokens`
  ADD CONSTRAINT `push_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `trip_activity`
--
ALTER TABLE `trip_activity`
  ADD CONSTRAINT `trip_activity_ibfk_1` FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `trip_activity_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `trip_collaborators`
--
ALTER TABLE `trip_collaborators`
  ADD CONSTRAINT `trip_collaborators_ibfk_1` FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `trip_collaborators_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `trip_feedback`
--
ALTER TABLE `trip_feedback`
  ADD CONSTRAINT `trip_feedback_ibfk_1` FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `trip_feedback_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `trip_feedback_ibfk_3` FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vote_sessions`
--
ALTER TABLE `vote_sessions`
  ADD CONSTRAINT `vote_sessions_ibfk_1` FOREIGN KEY (`host_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vote_session_participants`
--
ALTER TABLE `vote_session_participants`
  ADD CONSTRAINT `vote_session_participants_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `vote_sessions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `vote_session_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vote_session_responses`
--
ALTER TABLE `vote_session_responses`
  ADD CONSTRAINT `vote_session_responses_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `vote_sessions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `vote_session_responses_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `weather_alerts`
--
ALTER TABLE `weather_alerts`
  ADD CONSTRAINT `weather_alerts_ibfk_1` FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
